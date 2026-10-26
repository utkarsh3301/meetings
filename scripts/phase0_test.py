"""Phase 0: ffmpeg + pyannote + Parakeet + Nemotron on local recordings.

Setup:
    pip install nvidia-riva-client openai "pyannote.audio==3.3.2"
    ffmpeg must be on PATH.

Env:
    NVIDIA_API_KEY, NVIDIA_ASR_FUNCTION_ID, HF_TOKEN (pyannote weights)
    optional: NVIDIA_LLM_MODEL, NVIDIA_LLM_BASE_URL, ASR_DELAY_SEC

Usage:
    python scripts/phase0_test.py rec1.m4a rec2.mp3 --out phase0_out
    python scripts/phase0_test.py --selftest

Per recording, writes to <out>/<name>/:
    transcript_<lang>.txt, analysis.json, report.md
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import wave
from pathlib import Path

RATE = 16000
BYTES_PER_SEC = RATE * 2
ASR_URI = "grpc.nvcf.nvidia.com:443"
LLM_MODEL = os.getenv("NVIDIA_LLM_MODEL", "nvidia/nemotron-3-super-120b-a12b")
LLM_BASE = os.getenv("NVIDIA_LLM_BASE_URL", "https://integrate.api.nvidia.com/v1")
ASR_DELAY = float(os.getenv("ASR_DELAY_SEC", "0.2"))
MAX_TURN = 30.0
MIN_TURN = 1.0

SCHEMA = """{
  "summary": "string, 150-300 words",
  "decisions": [{"text": "string", "segment_ids": ["string"]}],
  "action_items": [{"text": "string", "owner": "string|null", "side": "CLIENT|QRYX|UNKNOWN", "due": "YYYY-MM-DD|null", "segment_ids": ["string"]}],
  "open_questions": [{"text": "string", "segment_ids": ["string"]}],
  "commitments": [{"text": "string", "by": "string|null", "due": "YYYY-MM-DD|null", "segment_ids": ["string"]}]
}"""


def preprocess(src: Path, dst: Path) -> float:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
         "-ac", "1", "-ar", str(RATE), "-sample_fmt", "s16", "-af", "loudnorm", str(dst)],
        check=True,
    )
    with wave.open(str(dst)) as w:
        return w.getnframes() / RATE


def diarize(wav: Path) -> list[tuple[float, float, str]]:
    from pyannote.audio import Pipeline

    pipe = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=os.environ["HF_TOKEN"])
    ann = pipe(str(wav))
    return [(t.start, t.end, spk) for t, _, spk in ann.itertracks(yield_label=True)]


def shape_turns(turns: list[tuple[float, float, str]]) -> list[tuple[float, float, str]]:
    """Merge same-speaker neighbours and sub-1s turns, split turns over 30s."""
    merged: list[list] = []
    for s, e, spk in sorted(turns):
        if merged and (merged[-1][2] == spk or e - s < MIN_TURN):
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e, spk])
    # ponytail: equal-length split, production splits at nearest silence (section 9)
    out = []
    for s, e, spk in merged:
        n = max(1, int(-(-(e - s) // MAX_TURN)))
        step = (e - s) / n
        out += [(s + i * step, s + (i + 1) * step, spk) for i in range(n)]
    return out


def riva_service():
    import riva.client

    auth = riva.client.Auth(
        uri=ASR_URI,
        use_ssl=True,
        metadata_args=[
            ["function-id", os.environ["NVIDIA_ASR_FUNCTION_ID"]],
            ["authorization", f"Bearer {os.environ['NVIDIA_API_KEY']}"],
        ],
    )
    return riva.client.ASRService(auth)


def asr_config(lang: str, diarization: bool = False):
    import riva.client

    cfg = riva.client.RecognitionConfig(
        encoding=riva.client.AudioEncoding.LINEAR_PCM,
        sample_rate_hertz=RATE,
        audio_channel_count=1,
        language_code=lang,
        max_alternatives=1,
        enable_automatic_punctuation=True,
        enable_word_time_offsets=diarization,
    )
    if diarization:
        riva.client.add_speaker_diarization_to_config(cfg, diarization_enable=True)
    return cfg


def recognize(svc, pcm: bytes, lang: str, mode: str, diarization: bool = False):
    """Returns (text, words). mode is 'offline' or 'streaming'."""
    import riva.client

    cfg = asr_config(lang, diarization)
    if mode == "offline":
        results = svc.offline_recognize(pcm, cfg).results
    else:
        chunk = BYTES_PER_SEC // 10
        chunks = (pcm[i:i + chunk] for i in range(0, len(pcm), chunk))
        stream_cfg = riva.client.StreamingRecognitionConfig(config=cfg, interim_results=False)
        results = [r for resp in svc.streaming_response_generator(chunks, stream_cfg)
                   for r in resp.results if r.is_final]
    alts = [r.alternatives[0] for r in results if r.alternatives]
    return " ".join(a.transcript.strip() for a in alts).strip(), [w for a in alts for w in a.words]


def with_retry(fn, *args):
    for attempt in range(3):
        try:
            return fn(*args)
        except Exception as exc:
            if attempt == 2:
                raise
            wait = 2 ** attempt * (5 if "RESOURCE_EXHAUSTED" in str(exc) or "429" in str(exc) else 1)
            print(f"    retry {attempt + 1} after {wait}s: {str(exc)[:120]}")
            time.sleep(wait)


def detect_mode(svc, pcm: bytes) -> tuple[str, str]:
    """Offline first, streaming if the hosted endpoint rejects it."""
    try:
        recognize(svc, pcm, "multi", "offline")
        return "offline", ""
    except Exception as exc:
        recognize(svc, pcm, "multi", "streaming")
        return "streaming", f"offline rejected: {str(exc)[:200]}"


def hosted_diarization(svc, pcm: bytes, mode: str) -> str:
    try:
        _, words = recognize(svc, pcm, "multi", mode, diarization=True)
    except Exception as exc:
        return f"request with diarization failed: {str(exc)[:200]}"
    tags = {getattr(w, "speaker_tag", 0) for w in words}
    tags.discard(0)
    return f"speaker tags returned: {sorted(tags)}" if tags else "no speaker tags returned"


def analyse(lines: list[str], valid_ids: set[str]) -> dict:
    from openai import OpenAI

    client = OpenAI(base_url=LLM_BASE, api_key=os.environ["NVIDIA_API_KEY"])
    prompt = (
        "You analyse a recorded client meeting between QRYX and a client. Transcript may be Hindi, "
        "English or mixed. Reply in English with JSON only, matching this schema exactly:\n"
        f"{SCHEMA}\n"
        "Every item must cite segment_ids from the transcript. Commitments are only things said by "
        "QRYX-side speakers; sides are unknown here, so infer from context.\n\n"
        "Transcript lines are: [segment_id] [mm:ss] Speaker (side): text\n\n" + "\n".join(lines)
    )
    raw = ""
    for attempt in range(2):
        resp = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=8000,
            extra_body={"chat_template_kwargs": {"enable_thinking": False}},
        )
        raw = resp.choices[0].message.content or ""
        match = re.search(r"\{.*\}", raw, re.S)
        try:
            data = json.loads(match.group(0)) if match else None
        except json.JSONDecodeError:
            data = None
        if isinstance(data, dict):
            dropped = 0
            for key in ("decisions", "action_items", "open_questions", "commitments"):
                for item in data.get(key) or []:
                    ids = item.get("segment_ids") or []
                    item["segment_ids"] = [i for i in ids if i in valid_ids]
                    dropped += len(ids) - len(item["segment_ids"])
            data["_dropped_segment_ids"] = dropped
            data["_usage"] = resp.usage.model_dump() if resp.usage else None
            return data
        print(f"    invalid JSON from LLM (attempt {attempt + 1})")
    return {"_error": "invalid JSON after retry", "_raw": raw[:4000]}


def mmss(sec: float) -> str:
    return f"{int(sec // 60):02d}:{int(sec % 60):02d}"


def run(src: Path, out_root: Path, langs: list[str], skip_llm: bool) -> None:
    out = out_root / src.stem
    out.mkdir(parents=True, exist_ok=True)
    timings, notes = {}, []
    print(f"\n== {src.name}")

    t = time.time()
    wav = out / "audio.wav"
    duration = preprocess(src, wav)
    timings["preprocess"] = time.time() - t
    with wave.open(str(wav)) as w:
        pcm = w.readframes(w.getnframes())

    t = time.time()
    turns = shape_turns(diarize(wav))
    timings["diarize"] = time.time() - t
    speakers = sorted({spk for _, _, spk in turns})
    print(f"  {mmss(duration)} audio, {len(turns)} segments, {len(speakers)} speakers")

    svc = riva_service()
    probe = pcm[: BYTES_PER_SEC * 20]
    mode, why = detect_mode(svc, probe)
    notes.append(f"ASR mode: {mode} {why}".strip())
    notes.append(f"Hosted diarization (first 60s): {hosted_diarization(svc, pcm[: BYTES_PER_SEC * 60], mode)}")

    seg_ids = [f"s{i:04d}" for i in range(len(turns))]
    lines_by_lang = {}
    for lang in langs:
        t = time.time()
        lines, failed = [], 0
        for sid, (s, e, spk) in zip(seg_ids, turns):
            chunk = pcm[int(s * RATE) * 2: int(e * RATE) * 2]
            try:
                text, _ = with_retry(recognize, svc, chunk, lang, mode)
            except Exception as exc:
                failed += 1
                text = f"<ASR FAILED: {str(exc)[:80]}>"
            lines.append(f"[{sid}] [{mmss(s)}] {spk} (UNKNOWN): {text}")
            time.sleep(ASR_DELAY)
        timings[f"asr_{lang}"] = time.time() - t
        lines_by_lang[lang] = lines
        (out / f"transcript_{lang}.txt").write_text("\n".join(lines), encoding="utf-8")
        notes.append(f"ASR {lang}: {failed} of {len(turns)} segments failed")
        print(f"  asr {lang}: {timings[f'asr_{lang}']:.0f}s, {failed} failed")

    if not skip_llm:
        t = time.time()
        analysis = analyse(lines_by_lang[langs[0]], set(seg_ids))
        timings["llm"] = time.time() - t
        (out / "analysis.json").write_text(json.dumps(analysis, indent=2, ensure_ascii=False), encoding="utf-8")
        notes.append(f"LLM on {langs[0]} transcript: " + analysis.get("_error", "valid JSON"))

    wav.unlink()
    report = [
        f"# {src.name}",
        f"Duration: {mmss(duration)}, segments: {len(turns)}, speakers: {len(speakers)}",
        "",
        *[f"- {n}" for n in notes],
        "",
        "## Timings (s)",
        *[f"- {k}: {v:.1f}" for k, v in timings.items()],
        "",
        "## Accuracy (fill in after reading transcripts)",
        *[f"- {lang}: usable yes/no, notes:" for lang in langs],
        "- Speaker split correct: yes/no",
        "- Summary and action items correct: yes/no",
    ]
    (out / "report.md").write_text("\n".join(report), encoding="utf-8")
    print(f"  wrote {out}")


def selftest() -> None:
    turns = [(0, 5, "A"), (5.2, 5.6, "B"), (6, 70, "A"), (70, 80, "B")]
    got = shape_turns(turns)
    assert [g[2] for g in got] == ["A", "A", "A", "B"], got
    assert all(e - s <= MAX_TURN for s, e, _ in got), got
    assert got[0][0] == 0 and got[2][1] == 70 and got[3] == (70, 80, "B"), got
    print("selftest ok")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*", type=Path)
    ap.add_argument("--out", type=Path, default=Path("phase0_out"))
    ap.add_argument("--langs", default="multi,hi-IN,en-US")
    ap.add_argument("--skip-llm", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    if not args.files:
        ap.error("pass at least one recording")
    missing = [k for k in ("NVIDIA_API_KEY", "NVIDIA_ASR_FUNCTION_ID", "HF_TOKEN") if not os.getenv(k)]
    if missing:
        sys.exit(f"missing env: {', '.join(missing)}")
    for f in args.files:
        run(f, args.out, args.langs.split(","), args.skip_llm)


if __name__ == "__main__":
    main()
