import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { db } from "@/lib/db";
import { isoDate, mmss } from "@/lib/format";
import { searchSegments } from "@/lib/search";

type SP = { q?: string; clientId?: string; projectId?: string };

export default async function Search({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 200);
  const [clients, projects, hits] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" } }),
    db.project.findMany({ include: { client: true }, orderBy: { name: "asc" } }),
    searchSegments(q, sp.clientId, sp.projectId),
  ]);

  return (
    <>
      <PageTitle sub="Across all transcripts">Search</PageTitle>
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block min-w-72 flex-1">
          <span className="label">Words</span>
          <input name="q" defaultValue={q} className="input" autoFocus placeholder='e.g. invoice, "go live", payment -draft' />
        </label>
        <label className="block min-w-40">
          <span className="label">Client</span>
          <select name="clientId" defaultValue={sp.clientId ?? ""} className="input">
            <option value="">All</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block min-w-48">
          <span className="label">Project</span>
          <select name="projectId" defaultValue={sp.projectId ?? ""} className="input">
            <option value="">All</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.client.name} / {p.name}</option>)}
          </select>
        </label>
        <button className="btn">Search</button>
      </form>

      {q && <p className="mb-3 text-sm text-muted">{hits.length === 100 ? "First 100 results" : `${hits.length} results`}</p>}
      <ul className="card divide-y divide-line">
        {hits.map((h) => (
          <li key={h.id}>
            <Link href={`/meetings/${h.meetingId}?seg=${h.id}`} className="block px-4 py-3 hover:bg-pink/40">
              <div className="flex flex-wrap gap-x-3 text-xs text-muted">
                <span className="font-semibold text-ink">{h.title}</span>
                <span>{h.client} / {h.project}</span>
                <span className="font-mono">{isoDate(h.meetingDate)} at {mmss(h.startMs)}</span>
              </div>
              <p className="mt-1 text-sm">
                {h.snippet.split(/(<<.*?>>)/).map((part, i) =>
                  part.startsWith("<<") ? <mark key={i} className="bg-pink px-0.5">{part.slice(2, -2)}</mark> : part,
                )}
              </p>
            </Link>
          </li>
        ))}
        {q && !hits.length && <li className="px-4 py-10 text-center text-sm text-muted">No matches.</li>}
      </ul>
    </>
  );
}
