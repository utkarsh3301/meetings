"""Cron entry: claim jobs until the queue is empty, run the pipeline, apply audio retention, exit."""
import logging
import os
import subprocess
import tempfile
import time

from psycopg.types.json import Jsonb

import db
import storage
from pipeline import analyse, diarize, preprocess, transcribe
from providers.base import ProviderError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("worker")

NOW = "(now() AT TIME ZONE 'utc')"
RUNNING = "('PREPROCESSING', 'DIARIZING', 'TRANSCRIBING', 'ANALYSING')"
IDLE = "('READY', 'NEEDS_ATTENTION', 'FAILED')"


def claim(conn):
    # Jobs that died mid-run 3 times (usually out of memory) stop being retried.
    conn.execute(f"""
        WITH dead AS (
            UPDATE "Job" SET status = 'FAILED', "finishedAt" = {NOW},
                error = 'Worker stopped mid-job 3 times, likely out of memory.'
            WHERE status IN {RUNNING} AND "startedAt" < {NOW} - interval '2 hours' AND attempts >= 3
            RETURNING "meetingId")
        UPDATE "Meeting" SET status = 'FAILED' WHERE id IN (SELECT "meetingId" FROM dead)""")
    return conn.execute(f"""
        UPDATE "Job" SET status = 'PREPROCESSING', "startedAt" = {NOW}, "finishedAt" = NULL, attempts = attempts + 1, error = NULL
        WHERE id = (
            SELECT id FROM "Job"
            WHERE status = 'QUEUED' OR (status IN {RUNNING} AND "startedAt" < {NOW} - interval '2 hours')
            ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id, "meetingId" """).fetchone()


def set_status(conn, job, status: str, error: str | None = None, finished: bool = False) -> None:
    with conn.transaction():
        conn.execute(
            f'UPDATE "Job" SET status = %s::"JobStatus", error = %s, "finishedAt" = CASE WHEN %s THEN {NOW} ELSE NULL END WHERE id = %s',
            (status, error, finished, job["id"]),
        )
        conn.execute('UPDATE "Meeting" SET status = %s::"JobStatus" WHERE id = %s', (status, job["meetingId"]))


def exists(conn, sql: str, mid: str) -> bool:
    return conn.execute(sql, (mid,)).fetchone() is not None


def run_job(conn, job) -> None:
    mid, timings = job["meetingId"], {}
    log.info("job %s claimed", job["id"])

    def stage(name, status, fn, *args):
        set_status(conn, job, status)
        log.info("job %s %s start", job["id"], name)
        t = time.monotonic()
        result = fn(*args)
        timings[name] = round(time.monotonic() - t, 1)
        conn.execute('UPDATE "Job" SET timings = %s WHERE id = %s', (Jsonb(timings), job["id"]))
        log.info("job %s %s done in %.0fs", job["id"], name, timings[name])
        return result

    try:
        meeting = conn.execute('SELECT * FROM "Meeting" WHERE id = %s', (mid,)).fetchone()
        diarized = exists(conn, 'SELECT 1 FROM "Speaker" WHERE "meetingId" = %s LIMIT 1', mid)
        untranscribed = exists(conn, 'SELECT 1 FROM "Segment" WHERE "meetingId" = %s AND language IS NULL LIMIT 1', mid)
        analysed = exists(conn, 'SELECT 1 FROM "Output" WHERE "meetingId" = %s LIMIT 1', mid)

        # Each stage commits before the next, so a rerun resumes from the first incomplete one.
        if not diarized or untranscribed:
            with tempfile.TemporaryDirectory() as tmp:
                wav = stage("preprocess", "PREPROCESSING", preprocess.run, conn, meeting, tmp)
                if not diarized:
                    stage("diarize", "DIARIZING", diarize.run, conn, meeting, wav)
                stage("transcribe", "TRANSCRIBING", transcribe.run, conn, meeting, wav)
        if not analysed:
            stage("analyse", "ANALYSING", analyse.run, conn, meeting)
        set_status(conn, job, "READY", finished=True)
        log.info("job %s ready", job["id"])
    except ProviderError as e:
        log.error("job %s needs attention: %s", job["id"], e)
        set_status(conn, job, "NEEDS_ATTENTION", str(e)[:1000], finished=True)
    except subprocess.CalledProcessError:
        log.exception("job %s ffmpeg failed", job["id"])
        set_status(conn, job, "FAILED", "Could not convert the recording. The file may be corrupt or in an unsupported format.", finished=True)
    except Exception as e:
        log.exception("job %s failed", job["id"])
        set_status(conn, job, "FAILED", f"{type(e).__name__}: {e}"[:1000], finished=True)


def retention(conn) -> None:
    days = int(os.getenv("AUDIO_RETENTION_DAYS", "30"))
    rows = conn.execute(
        f'SELECT id, "audioKey" FROM "Meeting" WHERE "audioKey" IS NOT NULL AND status IN {IDLE} '
        f'AND "createdAt" < {NOW} - make_interval(days => %s)',
        (days,),
    ).fetchall()
    for r in rows:
        storage.delete(r["audioKey"])
        conn.execute('UPDATE "Meeting" SET "audioKey" = NULL WHERE id = %s', (r["id"],))
    if rows:
        log.info("retention: deleted audio for %d meetings older than %d days", len(rows), days)


def main() -> None:
    conn = db.connect()
    done = 0
    while job := claim(conn):
        run_job(conn, job)
        done += 1
    retention(conn)
    log.info("queue empty, processed %d jobs, exiting", done)


if __name__ == "__main__":
    main()
