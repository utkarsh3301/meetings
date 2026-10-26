"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { ACTION_STATUSES, isoDate, label } from "@/lib/format";
import { Cites } from "./Cites";

export type ActionItemData = {
  id: string;
  meetingId: string;
  text: string;
  owner: string | null;
  side: string;
  dueDate: Date | string | null;
  status: string;
  segmentIds: string[];
};

export function ActionItemRow({ item, time, onCite, context }: {
  item: ActionItemData;
  time: Record<string, number>;
  onCite?: (id: string) => void;
  context?: React.ReactNode;
}) {
  const router = useRouter();
  const initial = { text: item.text, owner: item.owner ?? "", dueDate: isoDate(item.dueDate) };
  const [f, setF] = useState(initial);
  const [error, setError] = useState("");
  const dirty = f.text !== initial.text || f.owner !== initial.owner || f.dueDate !== initial.dueDate;

  async function save(data: Record<string, unknown>) {
    setError("");
    try {
      await api(`/api/action-items/${item.id}`, "PATCH", data);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className={`border-b border-line py-3 last:border-0 ${item.status !== "OPEN" ? "opacity-60" : ""}`}>
      {context && <div className="mb-1 text-xs text-muted">{context}</div>}
      <textarea
        className="input min-h-10 resize-y"
        rows={2}
        value={f.text}
        onChange={(e) => setF({ ...f, text: e.target.value })}
        aria-label="Action item"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input className="input w-36" placeholder="Owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} aria-label="Owner" />
        <input className="input w-40" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} aria-label="Due date" />
        <select className="input w-28" value={item.status} onChange={(e) => save({ status: e.target.value })} aria-label="Status">
          {ACTION_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        {item.side !== "UNKNOWN" && <span className="font-mono text-[11px] uppercase text-muted">{label(item.side)}</span>}
        <Cites ids={item.segmentIds} time={time} onCite={onCite} meetingId={item.meetingId} />
        {dirty && (
          <button className="btn ml-auto" onClick={() => save({ text: f.text, owner: f.owner || null, dueDate: f.dueDate || null })}>
            Save
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-alert">{error}</p>}
    </div>
  );
}
