import { db } from "./db";
import type { Cited } from "./format";

export async function loadMeeting(id: string) {
  const m = await db.meeting.findUnique({
    where: { id },
    include: {
      project: { include: { client: true } },
      speakers: { orderBy: { label: "asc" } },
      segments: { orderBy: { idx: "asc" } },
      outputs: { orderBy: { createdAt: "desc" } },
      actionItems: true,
      findings: true,
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!m) return null;
  const latest = (kind: string) => m.outputs.find((o) => o.kind === kind)?.content;
  return {
    ...m,
    summary: ((latest("SUMMARY") as { text?: string } | undefined)?.text ?? null) as string | null,
    decisions: (latest("DECISIONS") ?? []) as Cited[],
    openQuestions: (latest("OPEN_QUESTIONS") ?? []) as Cited[],
    job: m.jobs[0] ?? null,
  };
}

export type LoadedMeeting = NonNullable<Awaited<ReturnType<typeof loadMeeting>>>;
