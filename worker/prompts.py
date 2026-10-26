"""Prompt templates. One focus block per meeting type."""

FOCUS = {
    "DISCOVERY": "This is a discovery call. Focus on the client's goals, requirements, constraints, stakeholders, "
                 "systems they use today, and any budget or timeline signals.",
    "STATUS": "This is a status meeting. Focus on progress since last time, blockers, risks, dependencies "
              "and upcoming deadlines.",
    "UAT": "This is a UAT session. Focus on defects reported, what was accepted or rejected, sign-off decisions "
           "and requested changes.",
    "INTERNAL": "This is an internal QRYX meeting. Focus on decisions, owners and deadlines.",
    "OTHER": "Summarise the main topics, decisions and next steps.",
}

RULES = """Rules:
- Reply with one JSON object only, no prose, no code fences, matching the schema exactly.
- Write in English even when the transcript is Hindi or mixed Hindi and English.
- Every item must cite the segment_ids it is based on, copied exactly from the transcript. No item without evidence.
- Do not invent facts, owners or dates. Use null when unknown.
- Resolve relative due dates (for example "by Friday") against the meeting date. Use null if unclear.
- Each transcript line is: [segment_id] [mm:ss] Speaker Name (side): text. Side is CLIENT, QRYX or UNKNOWN.
- Use the client vocabulary for correct spelling of names, products and modules."""


def _context(meeting: dict, vocab: list[str]) -> str:
    return (
        f"Meeting: {meeting['title']}\n"
        f"Date: {meeting['meetingDate']:%Y-%m-%d}\n"
        f"Client: {meeting['client']}  Project: {meeting['project']}\n"
        f"Client vocabulary: {', '.join(vocab) if vocab else 'none'}"
    )


def analysis_prompt(meeting: dict, vocab: list[str], lines: list[str], schema: str) -> str:
    return f"""You analyse recorded meetings between QRYX (our company) and its clients.

{FOCUS.get(meeting['type'], FOCUS['OTHER'])}

{_context(meeting, vocab)}

Return JSON with this schema:
{schema}

{RULES}
- summary: 150 to 300 words, plain prose.
- action_items: concrete tasks someone agreed to do. owner is the person's name as it appears in the transcript.
- commitments: promises made by QRYX-side speakers only (deliverables, dates, fixes, extra work). Never include client promises.
- open_questions: questions raised and not answered in the meeting.

Transcript:
""" + "\n".join(lines)


def scope_prompt(meeting: dict, vocab: list[str], lines: list[str], baseline: str, schema: str) -> str:
    return f"""You check recorded client meetings for scope changes against the agreed project scope.

{_context(meeting, vocab)}

Agreed scope baseline:
<<<
{baseline}
>>>

Find every request, suggestion or agreement in the meeting that adds to, removes from or changes the agreed scope.
Only flag things that are clearly outside or different from the baseline. These are flags for human review.

Return JSON with this schema:
{schema}

{RULES}
- why_outside_scope: one or two sentences pointing to what the baseline says or does not say.
- Return an empty list if nothing is out of scope.

Transcript:
""" + "\n".join(lines)
