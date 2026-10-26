import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { Status } from "@/components/Status";
import { db } from "@/lib/db";
import { duration, isoDate, JOB_STATUSES, label, MEETING_TYPES } from "@/lib/format";

type SP = { clientId?: string; projectId?: string; type?: string; status?: string; sort?: string };

export default async function Meetings({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const pick = <T extends string>(v: string | undefined, all: readonly T[]) => (all.includes(v as T) ? (v as T) : undefined);
  const [clients, projects, meetings] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" } }),
    db.project.findMany({ include: { client: true }, orderBy: { name: "asc" } }),
    db.meeting.findMany({
      where: {
        projectId: sp.projectId || undefined,
        project: sp.clientId ? { clientId: sp.clientId } : undefined,
        type: pick(sp.type, MEETING_TYPES),
        status: pick(sp.status, JOB_STATUSES),
      },
      include: { project: { include: { client: true } } },
      orderBy: { meetingDate: sp.sort === "asc" ? "asc" : "desc" },
      take: 500,
    }),
  ]);

  return (
    <>
      <PageTitle sub={`${meetings.length} meetings`} right={<Link href="/upload" className="btn">Upload recording</Link>}>
        Meetings
      </PageTitle>

      <form className="mb-5 flex flex-wrap items-end gap-3">
        <Select name="clientId" label="Client" value={sp.clientId} options={clients.map((c) => [c.id, c.name])} />
        <Select name="projectId" label="Project" value={sp.projectId} options={projects.map((p) => [p.id, `${p.client.name} / ${p.name}`])} />
        <Select name="type" label="Type" value={sp.type} options={MEETING_TYPES.map((t) => [t, label(t)])} />
        <Select name="status" label="Status" value={sp.status} options={JOB_STATUSES.map((t) => [t, label(t)])} />
        <Select name="sort" label="Date" value={sp.sort} options={[["asc", "Oldest first"]]} empty="Newest first" />
        <button className="btn-ghost">Filter</button>
        <Link href="/" className="link pb-1.5 text-sm">Clear</Link>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["Title", "Client", "Project", "Date", "Type", "Duration", "Status"].map((h) => (
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {meetings.map((m) => (
              <tr key={m.id} className="hover:bg-pink/40">
                <td className="td font-medium"><Link href={`/meetings/${m.id}`} className="link">{m.title}</Link></td>
                <td className="td">{m.project.client.name}</td>
                <td className="td">{m.project.name}</td>
                <td className="td font-mono text-xs">{isoDate(m.meetingDate)}</td>
                <td className="td">{label(m.type)}</td>
                <td className="td font-mono text-xs">{duration(m.durationSec)}</td>
                <td className="td"><Status value={m.status} /></td>
              </tr>
            ))}
            {!meetings.length && (
              <tr><td colSpan={7} className="td py-10 text-center text-muted">No meetings yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Select({ name, label: text, value, options, empty = "All" }: {
  name: string; label: string; value?: string; options: [string, string][]; empty?: string;
}) {
  return (
    <label className="block min-w-36">
      <span className="label">{text}</span>
      <select name={name} defaultValue={value ?? ""} className="input">
        <option value="">{empty}</option>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
}
