import { label } from "@/lib/format";

const TONE: Record<string, string> = {
  READY: "text-moss",
  NEEDS_ATTENTION: "text-alert",
  FAILED: "text-alert",
};

// Static text by design: no animation, pulsing or badges for status.
export function Status({ value }: { value: string }) {
  return <span className={`font-mono text-xs uppercase tracking-wide ${TONE[value] ?? "text-muted"}`}>{label(value)}</span>;
}
