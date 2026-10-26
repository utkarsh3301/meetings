"use client";

import Link from "next/link";
import { mmss } from "@/lib/format";

// Source timestamps for an extracted item. Buttons seek in place; links open the meeting at that segment.
export function Cites({ ids, time, onCite, meetingId }: {
  ids: string[];
  time: Record<string, number>;
  onCite?: (id: string) => void;
  meetingId?: string;
}) {
  const known = ids.filter((id) => id in time);
  if (!known.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {known.map((id) =>
        onCite ? (
          <button key={id} type="button" className="chip" onClick={() => onCite(id)}>{mmss(time[id])}</button>
        ) : (
          <Link key={id} className="chip" href={`/meetings/${meetingId}?seg=${id}`}>{mmss(time[id])}</Link>
        ),
      )}
    </span>
  );
}
