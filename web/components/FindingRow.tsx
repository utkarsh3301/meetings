"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { label } from "@/lib/format";
import { Cites } from "./Cites";

export type FindingData = {
  id: string;
  meetingId: string;
  kind: string;
  text: string;
  detail: string | null;
  segmentIds: string[];
  review: string;
};

export function FindingRow({ finding, time, onCite, context }: {
  finding: FindingData;
  time: Record<string, number>;
  onCite?: (id: string) => void;
  context?: React.ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function review(value: string) {
    setError("");
    try {
      await api(`/api/findings/${finding.id}`, "PATCH", { review: value });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className={`border-b border-line py-3 last:border-0 ${finding.review === "DISMISSED" ? "opacity-50" : ""}`}>
      {context && <div className="mb-1 text-xs text-muted">{context}</div>}
      <p className="text-sm font-medium">{finding.text}</p>
      {finding.detail && <p className="mt-1 text-sm text-muted">{finding.detail}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Cites ids={finding.segmentIds} time={time} onCite={onCite} meetingId={finding.meetingId} />
        <span className="ml-auto font-mono text-[11px] uppercase text-muted">{label(finding.review)}</span>
        {finding.review !== "CONFIRMED" && <button className="btn-ghost py-0.5" onClick={() => review("CONFIRMED")}>Confirm</button>}
        {finding.review !== "DISMISSED" && <button className="btn-ghost py-0.5" onClick={() => review("DISMISSED")}>Dismiss</button>}
        {finding.review !== "UNREVIEWED" && <button className="link text-xs" onClick={() => review("UNREVIEWED")}>Undo</button>}
      </div>
      {error && <p className="mt-1 text-xs text-alert">{error}</p>}
    </div>
  );
}
