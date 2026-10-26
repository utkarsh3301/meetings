import logging
import os
import subprocess
import wave

import storage

log = logging.getLogger(__name__)
VIDEO_EXTS = {"mp4", "webm"}


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-y", "-nostdin", "-loglevel", "error", *args], check=True)


def run(conn, meeting: dict, tmp: str) -> str:
    """Download, convert to 16 kHz mono s16 wav, swap video for m4a in R2. Returns the wav path."""
    key = meeting["audioKey"]
    if not key:
        raise RuntimeError("Audio has been deleted, so this stage cannot run. Re-run analysis only.")
    ext = key.rsplit(".", 1)[-1].lower()
    src = os.path.join(tmp, f"source.{ext}")
    wav = os.path.join(tmp, "audio.wav")
    storage.download(key, src)
    ffmpeg("-i", src, "-vn", "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", "-af", "loudnorm", wav)

    with wave.open(wav) as w:
        duration = round(w.getnframes() / w.getframerate())

    if ext in VIDEO_EXTS:
        m4a = os.path.join(tmp, "audio.m4a")
        ffmpeg("-i", src, "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "64k", m4a)
        new_key = key.rsplit(".", 1)[0] + ".m4a"
        storage.upload(m4a, new_key, "audio/mp4")
        conn.execute('UPDATE "Meeting" SET "audioKey" = %s WHERE id = %s', (new_key, meeting["id"]))
        storage.delete(key)
        meeting["audioKey"] = new_key
        log.info("replaced video with audio-only m4a")

    os.remove(src)
    conn.execute('UPDATE "Meeting" SET "durationSec" = %s WHERE id = %s', (duration, meeting["id"]))
    return wav
