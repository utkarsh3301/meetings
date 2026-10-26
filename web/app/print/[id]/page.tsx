import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { buildBlocks, type Part } from "@/lib/export";
import { loadMeeting } from "@/lib/meeting";
import { PrintOnLoad } from "./PrintOnLoad";

export default async function Print({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ part?: string }>;
}) {
  await requireUser();
  const [{ id }, { part }] = await Promise.all([params, searchParams]);
  const m = await loadMeeting(id);
  if (!m) notFound();
  const blocks = buildBlocks(m, (["summary", "transcript"].includes(part ?? "") ? part : "both") as Part);

  return (
    <article className="mx-auto max-w-3xl bg-white px-8 py-10 text-[13px] leading-relaxed print:p-0">
      <PrintOnLoad />
      {blocks.map((b, i) => {
        if (b.kind === "h1") return <h1 key={i} className="display mb-1 text-4xl">{b.text}</h1>;
        if (b.kind === "h2") return <h2 key={i} className="display mt-6 mb-2 border-b border-ink pb-1 text-xl">{b.text}</h2>;
        if (b.kind === "p") return <p key={i} className="mb-2">{b.text}</p>;
        if (b.kind === "li")
          return (
            <p key={i} className="mb-1.5 pl-4 -indent-4">
              - {b.text}{b.refs && <span className="text-muted"> ({b.refs})</span>}
            </p>
          );
        return (
          <p key={i} className="mb-2 break-inside-avoid">
            <span className="font-mono text-[11px] text-muted">[{b.time}]</span> <b>{b.who}:</b> {b.text}
          </p>
        );
      })}
    </article>
  );
}
