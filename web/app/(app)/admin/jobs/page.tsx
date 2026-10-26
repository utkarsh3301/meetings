import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { Status } from "@/components/Status";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

const STAGES = ["preprocess", "diarize", "transcribe", "analyse"];
const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "");
const mins = (s?: number) => (s === undefined ? "" : s < 90 ? `${Math.round(s)}s` : `${(s / 60).toFixed(1)}m`);

export default async function Jobs() {
  await requireAdmin();
  const jobs = await db.job.findMany({
    include: { meeting: { select: { id: true, title: true, durationSec: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <PageTitle sub="Last 100 jobs. Times are UTC.">Jobs</PageTitle>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["Meeting", "Status", "Attempts", "Queued", "Started", "Finished", ...STAGES, "Error"].map((h) => <th key={h} className="th">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const t = (j.timings ?? {}) as Record<string, number>;
              return (
                <tr key={j.id}>
                  <td className="td"><Link className="link" href={`/meetings/${j.meeting.id}`}>{j.meeting.title}</Link></td>
                  <td className="td"><Status value={j.status} /></td>
                  <td className="td font-mono text-xs">{j.attempts}</td>
                  <td className="td font-mono text-xs">{fmt(j.createdAt)}</td>
                  <td className="td font-mono text-xs">{fmt(j.startedAt)}</td>
                  <td className="td font-mono text-xs">{fmt(j.finishedAt)}</td>
                  {STAGES.map((s) => <td key={s} className="td font-mono text-xs">{mins(t[s])}</td>)}
                  <td className="td max-w-sm text-xs text-alert">{j.error}</td>
                </tr>
              );
            })}
            {!jobs.length && <tr><td colSpan={11} className="td py-10 text-center text-muted">No jobs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
