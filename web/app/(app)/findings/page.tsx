import Link from "next/link";
import { FindingRow } from "@/components/FindingRow";
import { PageTitle } from "@/components/PageTitle";
import { db } from "@/lib/db";
import { isoDate } from "@/lib/format";
import { segmentTimes } from "@/lib/times";

export default async function Findings({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const findings = await db.finding.findMany({
    where: all ? undefined : { review: "UNREVIEWED" },
    include: { meeting: { include: { project: { include: { client: true } } } } },
    orderBy: { meeting: { meetingDate: "desc" } },
    take: 1000,
  });
  const time = await segmentTimes(findings.flatMap((f) => f.segmentIds));

  const byProject = new Map<string, typeof findings>();
  for (const f of findings) {
    const key = `${f.meeting.project.client.name} / ${f.meeting.project.name}`;
    byProject.set(key, [...(byProject.get(key) ?? []), f]);
  }

  return (
    <>
      <PageTitle
        sub={all ? "All findings" : `${findings.length} waiting for review`}
        right={<Link className="btn-ghost" href={all ? "/findings" : "/findings?all=1"}>{all ? "Unreviewed only" : "Show all"}</Link>}
      >
        Findings
      </PageTitle>
      {!findings.length && <p className="text-sm text-muted">Nothing to review.</p>}
      <div className="space-y-6">
        {[...byProject].map(([project, list]) => (
          <section key={project} className="card px-4 pb-1">
            <h2 className="display border-b border-ink py-3 text-xl">{project}</h2>
            {(["SCOPE_CHANGE", "COMMITMENT"] as const).map((kind) => {
              const rows = list.filter((f) => f.kind === kind);
              if (!rows.length) return null;
              return (
                <div key={kind}>
                  <h3 className="label mt-3">{kind === "SCOPE_CHANGE" ? "Scope flags" : "Commitments"}</h3>
                  {rows.map((f) => (
                    <FindingRow
                      key={f.id}
                      finding={f}
                      time={time}
                      context={<><Link className="link" href={`/meetings/${f.meetingId}`}>{f.meeting.title}</Link>{`  ·  ${isoDate(f.meeting.meetingDate)}`}</>}
                    />
                  ))}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}
