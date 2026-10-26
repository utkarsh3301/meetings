import { z } from "zod";
import { apiUser, body, Ctx, HttpError, route } from "@/lib/api";
import { db } from "@/lib/db";

const IDLE = ["READY", "NEEDS_ATTENTION", "FAILED"];

// resume: continue from the first incomplete stage (keeps finished segments).
// analysis: drop analysis output and redo it, e.g. after renaming speakers.
// all: wipe everything derived from audio and start over.
export const POST = route(async (req, { params }: Ctx) => {
  const { stage } = await body(req, z.object({ stage: z.enum(["resume", "analysis", "all"]) }));
  await apiUser(stage !== "analysis");
  const { id } = await params;
  const m = await db.meeting.findUniqueOrThrow({ where: { id } });
  if (!IDLE.includes(m.status)) throw new HttpError(409, "A job is already queued or running for this meeting.");
  if (stage === "all" && !m.audioKey) throw new HttpError(409, "Audio has been deleted, only analysis can be re-run.");
  if (stage === "analysis" && !(await db.segment.count({ where: { meetingId: id } })))
    throw new HttpError(409, "No transcript yet.");

  const where = { meetingId: id };
  await db.$transaction([
    ...(stage === "resume"
      ? []
      : [db.output.deleteMany({ where }), db.actionItem.deleteMany({ where }), db.finding.deleteMany({ where })]),
    ...(stage === "all"
      ? [db.segment.deleteMany({ where }), db.speaker.deleteMany({ where }), db.meeting.update({ where: { id }, data: { durationSec: null } })]
      : []),
    db.job.create({ data: { meetingId: id } }),
    db.meeting.update({ where: { id }, data: { status: "QUEUED" } }),
  ]);
  return Response.json({ ok: true });
});
