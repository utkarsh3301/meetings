// Pure helpers, safe to import from client components.

export const MEETING_TYPES = ["DISCOVERY", "STATUS", "UAT", "INTERNAL", "OTHER"] as const;
export const SIDES = ["CLIENT", "QRYX", "UNKNOWN"] as const;
export const ACTION_STATUSES = ["OPEN", "DONE", "DROPPED"] as const;
export const JOB_STATUSES = [
  "QUEUED", "PREPROCESSING", "DIARIZING", "TRANSCRIBING", "ANALYSING", "READY", "NEEDS_ATTENTION", "FAILED",
] as const;
export const LANGUAGES = [
  { value: "multi", label: "Auto (Hindi + English)" },
  { value: "hi-IN", label: "Hindi" },
  { value: "en-US", label: "English" },
];

export function mmss(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const label = (v: string) => v.replace(/_/g, " ").toLowerCase();

export const isoDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toISOString().slice(0, 10) : "";

export const duration = (sec: number | null | undefined) => (sec ? mmss(sec * 1000) : "");

export const speakerName = (sp: { displayName: string | null; label: string } | null | undefined) =>
  sp?.displayName || sp?.label || "Unknown";

export type Cited = { text: string; segmentIds: string[] };
