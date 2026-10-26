import json
import logging
import re

from psycopg.types.json import Jsonb
from pydantic import BaseModel, ValidationError

import prompts
from db import new_id
from providers.base import ProviderError, get_llm
from schemas import ANALYSIS_SCHEMA, SCOPE_SCHEMA, MeetingAnalysis, ScopeChanges

log = logging.getLogger(__name__)


def mmss(ms: int) -> str:
    s = ms // 1000
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60:02d}:{s % 60:02d}"


def build_lines(segments: list[dict]) -> tuple[list[str], dict[str, str]]:
    """Transcript lines with short ids (s0, s1, ...) and the map back to DB segment ids."""
    lines, ids = [], {}
    for s in segments:
        text = (s["editedText"] if s["editedText"] is not None else s["text"]).strip()
        if not text:
            continue
        short = f"s{s['idx']}"
        ids[short] = s["id"]
        name = s["displayName"] or s["label"] or "Unknown"
        lines.append(f"[{short}] [{mmss(s['startMs'])}] {name} ({s['side'] or 'UNKNOWN'}): {text}")
    return lines, ids


def parse(raw: str, model: type[BaseModel]):
    match = re.search(r"\{.*\}", raw, re.S)
    if not match:
        raise ValueError("no JSON object in reply")
    return model.model_validate(json.loads(match.group(0)))


def ask(llm, prompt: str, model: type[BaseModel], reasoning: bool, max_tokens: int):
    """One retry on invalid JSON, then NEEDS_ATTENTION."""
    raw = llm.complete(prompt, reasoning, max_tokens)
    try:
        return parse(raw, model)
    except (ValueError, ValidationError) as e:
        log.warning("invalid JSON from LLM, retrying once: %s", str(e)[:200])
        retry = f"{prompt}\n\nYour previous reply was not valid JSON for the schema ({str(e)[:300]}). Reply with the JSON object only."
        try:
            return parse(llm.complete(retry, reasoning, max_tokens), model)
        except (ValueError, ValidationError) as e2:
            raise ProviderError(f"LLM returned invalid JSON twice: {str(e2)[:300]}") from e2


def cite(ids: list[str], idmap: dict[str, str]) -> list[str]:
    """Map short ids to DB ids, dropping any the model invented."""
    return list(dict.fromkeys(idmap[i] for i in ids if i in idmap))


def run(conn, meeting: dict) -> None:
    ctx = conn.execute(
        'SELECT c.name AS client, p.name AS project, p."scopeBaseline", p."clientId" '
        'FROM "Project" p JOIN "Client" c ON c.id = p."clientId" WHERE p.id = %s',
        (meeting["projectId"],),
    ).fetchone()
    vocab = [r["term"] for r in conn.execute('SELECT term FROM "VocabTerm" WHERE "clientId" = %s ORDER BY term', (ctx["clientId"],))]
    segments = conn.execute(
        'SELECT s.id, s.idx, s."startMs", s.text, s."editedText", sp.label, sp."displayName", sp.side '
        'FROM "Segment" s LEFT JOIN "Speaker" sp ON sp.id = s."speakerId" WHERE s."meetingId" = %s ORDER BY s.idx',
        (meeting["id"],),
    ).fetchall()
    lines, idmap = build_lines(segments)
    if not lines:
        raise RuntimeError("Transcript is empty, nothing to analyse.")
    info = {**meeting, "client": ctx["client"], "project": ctx["project"]}

    llm = get_llm()
    a: MeetingAnalysis = ask(llm, prompts.analysis_prompt(info, vocab, lines, ANALYSIS_SCHEMA), MeetingAnalysis, False, 16000)
    scope = None
    if (ctx["scopeBaseline"] or "").strip():
        scope = ask(llm, prompts.scope_prompt(info, vocab, lines, ctx["scopeBaseline"], SCOPE_SCHEMA), ScopeChanges, True, 32000)

    # Commitments are QRYX-side only. Enforce it once speakers have sides; before that, trust the prompt.
    qryx = {s["id"] for s in segments if s["side"] == "QRYX"}
    commitments = [c for c in a.commitments if not qryx or set(cite(c.segment_ids, idmap)) & qryx]

    def cited(items):
        return [{"text": i.text, "segmentIds": ids} for i in items if (ids := cite(i.segment_ids, idmap))]

    mid = meeting["id"]
    with conn.transaction():
        for table in ("Output", "ActionItem", "Finding"):
            conn.execute(f'DELETE FROM "{table}" WHERE "meetingId" = %s', (mid,))
        outputs = [("SUMMARY", {"text": a.summary.strip()}), ("DECISIONS", cited(a.decisions)), ("OPEN_QUESTIONS", cited(a.open_questions))]
        for kind, content in outputs:
            conn.execute(
                'INSERT INTO "Output" (id, "meetingId", kind, content, model) VALUES (%s, %s, %s::"OutputKind", %s, %s)',
                (new_id(), mid, kind, Jsonb(content), llm.model),
            )
        for i in a.action_items:
            if ids := cite(i.segment_ids, idmap):
                conn.execute(
                    'INSERT INTO "ActionItem" (id, "meetingId", text, owner, side, "dueDate", "segmentIds") '
                    'VALUES (%s, %s, %s, %s, %s::"Side", %s::timestamp, %s)',
                    (new_id(), mid, i.text, i.owner, i.side, i.due, ids),
                )
        findings = [
            ("COMMITMENT", c.text, ". ".join(x for x in (c.by and f"By {c.by}", c.due and f"Due {c.due}") if x) or None, c.segment_ids)
            for c in commitments
        ] + [("SCOPE_CHANGE", s.request, s.why_outside_scope, s.segment_ids) for s in (scope.scope_changes if scope else [])]
        for kind, text, detail, short_ids in findings:
            if ids := cite(short_ids, idmap):
                conn.execute(
                    'INSERT INTO "Finding" (id, "meetingId", kind, text, detail, "segmentIds") VALUES (%s, %s, %s::"FindingKind", %s, %s, %s)',
                    (new_id(), mid, kind, text, detail, ids),
                )
    log.info(
        "analysis from model: %d decisions, %d actions, %d commitments, %d scope flags (uncited items dropped)",
        len(a.decisions), len(a.action_items), len(commitments), len(scope.scope_changes) if scope else 0,
    )
