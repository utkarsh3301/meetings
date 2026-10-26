import logging
import os

import numpy as np

from db import new_id

log = logging.getLogger(__name__)
RATE = 16000
MIN_TURN = 1.0
MAX_TURN = float(os.getenv("MAX_SEGMENT_SEC", "30"))
SEARCH = 4.0  # seconds either side of a split target to look for silence


def load_pcm(wav_path: str) -> np.ndarray:
    import wave

    with wave.open(wav_path) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)


def quietest(audio: np.ndarray, lo: float, hi: float) -> float:
    """Time (s) of the quietest 100 ms window in [lo, hi]."""
    win = RATE // 10
    a, b = int(lo * RATE), int(hi * RATE)
    chunk = audio[a:b].astype(np.float32)
    n = len(chunk) // win
    if n < 2:
        return (lo + hi) / 2
    energy = (chunk[: n * win].reshape(n, win) ** 2).mean(axis=1)
    return lo + (int(energy.argmin()) + 0.5) * win / RATE


def shape_turns(turns, audio: np.ndarray | None = None):
    """Merge same-speaker neighbours and sub-1s turns, remove overlap, split turns over MAX_TURN at silences."""
    merged: list[list] = []
    for s, e, spk in sorted(turns):
        if merged and (merged[-1][2] == spk or e - s < MIN_TURN):
            merged[-1][1] = max(merged[-1][1], e)
            continue
        if merged and s < merged[-1][1]:
            s = merged[-1][1]
            if e - s < MIN_TURN:
                continue
        merged.append([s, e, spk])

    out = []
    for s, e, spk in merged:
        while e - s > MAX_TURN:
            target = s + MAX_TURN - SEARCH
            cut = quietest(audio, target - SEARCH, target + SEARCH) if audio is not None else target
            out.append((s, cut, spk))
            s = cut
        out.append((s, e, spk))
    return out


def pyannote_turns(audio: np.ndarray):
    import torch
    from pyannote.audio import Pipeline

    torch.set_num_threads(os.cpu_count() or 2)
    pipe = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=os.getenv("HF_TOKEN"))
    waveform = torch.from_numpy(audio.astype(np.float32) / 32768.0).unsqueeze(0)
    ann = pipe({"waveform": waveform, "sample_rate": RATE})
    return [(t.start, t.end, spk) for t, _, spk in ann.itertracks(yield_label=True)]


def run(conn, meeting: dict, wav_path: str) -> None:
    if os.getenv("DIARIZER", "pyannote") != "pyannote":
        raise RuntimeError("Only DIARIZER=pyannote is implemented.")
    audio = load_pcm(wav_path)
    turns = shape_turns(pyannote_turns(audio), audio)
    if not turns:
        turns = shape_turns([(0.0, len(audio) / RATE, "SPEAKER_00")], audio)

    speaker_ids = {label: new_id() for label in sorted({t[2] for t in turns})}
    with conn.transaction():
        for label, sid in speaker_ids.items():
            conn.execute('INSERT INTO "Speaker" (id, "meetingId", label) VALUES (%s, %s, %s)', (sid, meeting["id"], label))
        with conn.cursor() as cur:
            cur.executemany(
                'INSERT INTO "Segment" (id, "meetingId", "speakerId", idx, "startMs", "endMs", text) '
                "VALUES (%s, %s, %s, %s, %s, %s, '')",
                [(new_id(), meeting["id"], speaker_ids[spk], i, int(s * 1000), int(e * 1000)) for i, (s, e, spk) in enumerate(turns)],
            )
    log.info("diarized: %d speakers, %d segments", len(speaker_ids), len(turns))


if __name__ == "__main__":
    t = shape_turns([(0, 5, "A"), (5.2, 5.6, "B"), (6, 70, "A"), (69, 80, "B"), (79.5, 80.2, "A")])
    assert [x[2] for x in t] == ["A", "A", "A", "B"], t
    assert all(e - s <= MAX_TURN for s, e, _ in t), t
    assert t[2][1] == 70 and t[3] == (70, 80.2, "B"), t
    silent = np.random.default_rng(0).integers(-3000, 3000, RATE * 40).astype(np.int16)
    silent[RATE * 25: RATE * 25 + RATE // 5] = 0
    cut = shape_turns([(0, 40, "A")], silent)[0][1]
    assert 24.9 <= cut <= 25.3, cut
    print("diarize selftest ok")
