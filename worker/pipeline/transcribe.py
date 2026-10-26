import logging
import os
import time

from providers.base import get_asr

log = logging.getLogger(__name__)
RATE = 16000
DELAY = float(os.getenv("ASR_DELAY_SEC", "0.2"))


def run(conn, meeting: dict, wav_path: str) -> None:
    """Transcribe segments not done yet. Each one commits, so a failure resumes where it stopped."""
    import wave

    rows = conn.execute(
        'SELECT id, idx, "startMs", "endMs" FROM "Segment" WHERE "meetingId" = %s AND language IS NULL ORDER BY idx',
        (meeting["id"],),
    ).fetchall()
    if not rows:
        return
    with wave.open(wav_path) as w:
        pcm = w.readframes(w.getnframes())

    asr = get_asr()
    log.info("transcribing %d segments with %s", len(rows), asr.model)
    for n, seg in enumerate(rows, 1):
        chunk = pcm[seg["startMs"] * RATE // 1000 * 2: seg["endMs"] * RATE // 1000 * 2]
        text, language = asr.transcribe(chunk, meeting["languageHint"]) if chunk else ("", meeting["languageHint"])
        conn.execute('UPDATE "Segment" SET text = %s, language = %s WHERE id = %s', (text, language, seg["id"]))
        if n % 50 == 0:
            log.info("transcribed %d/%d", n, len(rows))
        time.sleep(DELAY)
