import Link from "next/link";
import { ActionItemRow } from "@/components/ActionItemRow";
import { PageTitle } from "@/components/PageTitle";
import { db } from "@/lib/db";
import { ACTION_STATUSES, isoDate, label } from "@/lib/format";
import { segmentTimes } from "@/lib/times";

type SP = { clientId?: string; owner?: string; status?: string };

export default async function ActionItems({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const status = ACTION_STATUSES.find((s) => s === (sp.status ?? "OPEN"));
  const [clients, items] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" } }),
    db.actionItem.findMany({
      where: {
        status,
        owner: sp.owner ? { contains: sp.owner, mode: "insensitive" } : undefined,
        meeting: sp.clientId ? { project: { clientId: sp.clientId } } : undefined,
      },
      include: { meeting: { include: { project: { include: { client: true } } } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { meeting: { meetingDate: "desc" } }],
      take: 500,
    }),
  ]);
  const time = await segmentTimes(items.flatMap((i) => i.segmentIds));

  return (
    <>
      <PageTitle sub={`${items.length} items`}>Action items</PageTitle>
      <form className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block min-w-40">
          <span className="label">Client</span>
          <select name="clientId" defaultValue={sp.clientId ?? ""} className="input">
            <option value="">All</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Owner</span>
          <input name="owner" defaultValue={sp.owner ?? ""} className="input" />
        </label>
        <label className="block min-w-32">
          <span className="label">Status</span>
          <select name="status" defaultValue={sp.status ?? "OPEN"} className="input">
            <option value="ALL">All</option>
            {ACTION_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </label>
        <button className="btn-ghost">Filter</button>
      </form>
      <div className="card px-4">
        {items.map((i) => (
          <ActionItemRow
            key={i.id}
            item={i}
            time={time}
            context={
              <>
                <Link className="link" href={`/meetings/${i.meetingId}`}>{i.meeting.title}</Link>
                {`  ·  ${i.meeting.project.client.name} / ${i.meeting.project.name}  ·  ${isoDate(i.meeting.meetingDate)}`}
              </>
            }
          />
        ))}
        {!items.length && <p className="py-10 text-center text-sm text-muted">No action items match.</p>}
      </div>
    </>
  );
}
