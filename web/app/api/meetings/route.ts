import { z } from "zod";
import { apiUser, body, HttpError, id, route } from "@/lib/api";
import { db } from "@/lib/db";
import { JOB_STATUSES, MEETING_TYPES } from "@/lib/format";

const create = z.object({
  projectId: id,
  title: z.string().trim().min(1).max(200),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(MEETING_TYPES),
  languageHint: z.enum(["multi", "hi-IN", "en-US"]).default("multi"),
  consentGiven: z.literal(true),
  audioKey: z.string().regex(/^uploads\/[0-9a-f-]+\.(mp3|m4a|wav|mp4|webm)$/),
});

export const POST = route(async (req) => {
  const user = await apiUser();
  const b = await body(req, create);
  if (!(await db.project.findUnique({ where: { id: b.projectId } }))) throw new HttpError(400, "Unknown project");
  const meeting = await db.meeting.create({
    data: {
      ...b,
      meetingDate: new Date(`${b.meetingDate}T00:00:00Z`),
      createdById: user.id,
      jobs: { create: {} },
    },
  });
  return Response.json({ id: meeting.id }, { status: 201 });
});

export const GET = route(async (req) => {
  await apiUser();
  const sp = new URL(req.url).searchParams;
  const f = z
    .object({
      clientId: z.string().optional(),
      projectId: z.string().optional(),
      type: z.enum(MEETING_TYPES).optional(),
      status: z.enum(JOB_STATUSES).optional(),
      sort: z.enum(["asc", "desc"]).default("desc"),
    })
    .parse(Object.fromEntries([...sp].filter(([, v]) => v)));
  const meetings = await db.meeting.findMany({
    where: {
      projectId: f.projectId,
      project: f.clientId ? { clientId: f.clientId } : undefined,
      type: f.type,
      status: f.status,
    },
    include: { project: { include: { client: true } } },
    orderBy: { meetingDate: f.sort },
  });
  return Response.json(meetings);
});
