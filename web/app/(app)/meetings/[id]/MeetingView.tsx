"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionItemRow } from "@/components/ActionItemRow";
import { Cites } from "@/components/Cites";
import { FindingRow } from "@/components/FindingRow";
import { Status } from "@/components/Status";
import { api } from "@/lib/client";
import { duration, isoDate, label, LANGUAGES, mmss, SIDES, speakerName, type Cited } from "@/lib/format";
import type { LoadedMeeting } from "@/lib/meeting";

const IDLE = ["READY", "NEEDS_ATTENTION", "FAILED"];
const STAGE_TEXT: Record<string, string> = {
  QUEUED: "Waiting for the worker. It checks for new jobs every 10 minutes.",
  PREPROCESSING: "Converting audio.",
  DIARIZING: "Finding who spoke when. This is the slow step, roughly 10 to 15 minutes per hour of audio.",
  TRANSCRIBING: "Transcribing speech.",
  ANALYSING: "Writing summary, action items and findings.",
  NEEDS_ATTENTION: "Stopped. A call to NVIDIA kept failing. Completed work is kept and the job can be resumed.",
  FAILED: "Processing failed.",
};
const TABS = ["Summary", "Decisions", "Action items", "Open questions", "Commitments", "Scope flags"] as const;
const SIDE_TONE: Record<string, string> = { QRYX: "text-rust", CLIENT: "text-ink", UNKNOWN: "text-muted" };

export function MeetingView({ meeting: m, isAdmin, initialSeg }: { meeting: LoadedMeeting; isAdmin: boolean; initialSeg?: string }) {
  const router = useRouter();
  const audio = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioMsg, setAudioMsg] = useState("");
  const [current, setCurrent] = useState<string | null>(initialSeg ?? null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Summary");
  const [error, setError] = useState("");
  const pendingSeek = useRef<number | null>(null);
  const lastRetry = useRef(0);

  const speakers = useMemo(() => Object.fromEntries(m.speakers.map((s) => [s.id, s])), [m.speakers]);
  const time = useMemo(() => Object.fromEntries(m.segments.map((s) => [s.id, s.startMs])), [m.segments]);
  const commitments = m.findings.filter((f) => f.kind === "COMMITMENT");
  const scope = m.findings.filter((f) => f.kind === "SCOPE_CHANGE");
  const idle = IDLE.includes(m.status);

  const loadAudio = useCallback(async () => {
    if (!m.audioKey) return setAudioMsg("Audio deleted after the retention period. Transcript is kept.");
    try {
      setAudioUrl((await api<{ url: string }>(`/api/meetings/${m.id}/audio`, "GET")).url);
    } catch (e) {
      setAudioMsg((e as Error).message);
    }
  }, [m.id, m.audioKey]);

  useEffect(() => void loadAudio(), [loadAudio]);

  // Refresh while the worker is busy so stage and results appear without a manual reload.
  useEffect(() => {
    if (idle) return;
    const t = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(t);
  }, [idle, router]);

  const seek = useCallback((segId: string) => {
    const seg = m.segments.find((s) => s.id === segId);
    if (!seg) return;
    setCurrent(segId);
    document.getElementById(`seg-${segId}`)?.scrollIntoView({ block: "center" });
    const a = audio.current;
    if (a && a.readyState > 0) a.currentTime = seg.startMs / 1000;
    else pendingSeek.current = seg.startMs / 1000;
  }, [m.segments]);

  useEffect(() => {
    if (initialSeg) seek(initialSeg);
  }, [initialSeg, seek]);

  function onTime() {
    const ms = (audio.current?.currentTime ?? 0) * 1000;
    const seg = m.segments.find((s) => ms >= s.startMs && ms < s.endMs);
    if (seg && seg.id !== current) setCurrent(seg.id);
  }

  async function onAudioError() {
    // Presigned URLs expire after 15 minutes; fetch a fresh one and keep position, at most once a minute.
    if (Date.now() - lastRetry.current < 60000) {
      setAudioUrl(null);
      return setAudioMsg("Audio could not be loaded.");
    }
    lastRetry.current = Date.now();
    pendingSeek.current = audio.current?.currentTime ?? null;
    await loadAudio();
  }

  async function act(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const rerun = (stage: string) => act(() => api(`/api/meetings/${m.id}/rerun`, "POST", { stage }));
  const lang = LANGUAGES.find((l) => l.value === m.languageHint)?.label ?? m.languageHint;
  const exportUrl = (format: string, part: string) => `/api/meetings/${m.id}/export?format=${format}&part=${part}`;

  return (
    <div>
      <div className="relative mb-4">
        <div aria-hidden className="stipple-coarse fade-right pointer-events-none absolute -left-3 -top-3 h-20 w-80 opacity-25" />
        <h1 className="display relative text-4xl sm:text-5xl">{m.title}</h1>
        <p className="relative mt-2 text-sm text-muted">
          {[`${m.project.client.name} / ${m.project.name}`, isoDate(m.meetingDate), label(m.type), lang, duration(m.durationSec)]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
        <Status value={m.status} />
        <span className="text-sm">{STAGE_TEXT[m.status] ?? ""}</span>
        {idle && m.status !== "READY" && m.job?.error && <span className="w-full text-sm text-alert">Error: {m.job.error}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {m.status === "READY" || m.segments.length ? (
            <details className="relative">
              <summary className="btn-ghost list-none">Export</summary>
              <div className="card absolute right-0 z-20 mt-1 w-56 p-2 text-sm">
                {[["both", "Transcript and summary"], ["summary", "Summary only"], ["transcript", "Transcript only"]].map(([part, text]) => (
                  <div key={part} className="border-b border-line py-1.5 last:border-0">
                    <div className="text-xs text-muted">{text}</div>
                    <div className="mt-1 flex gap-3">
                      <a className="link" href={exportUrl("md", part)}>Markdown</a>
                      <a className="link" href={exportUrl("docx", part)}>Word</a>
                      <a className="link" href={exportUrl("pdf", part)} target="_blank">PDF</a>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {idle && m.segments.length > 0 && <button className="btn-ghost" onClick={() => rerun("analysis")}>Re-run analysis</button>}
          {isAdmin && (m.status === "NEEDS_ATTENTION" || m.status === "FAILED") && (
            <button className="btn" onClick={() => rerun("resume")}>Resume job</button>
          )}
          {isAdmin && idle && m.audioKey && (
            <button className="btn-ghost" onClick={() => confirm("Re-run from scratch? This replaces the transcript, including edits and speaker names.") && rerun("all")}>
              Re-run all
            </button>
          )}
          {isAdmin && (
            <button
              className="btn-danger"
              onClick={() =>
                confirm(`Delete "${m.title}"? This removes the transcript, results and audio. It cannot be undone.`) &&
                act(async () => {
                  await api(`/api/meetings/${m.id}`, "DELETE");
                  router.push("/");
                })
              }
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {error && <p className="mb-4 text-sm text-alert">{error}</p>}

      <div className="sticky top-0 z-10 mb-6 border-b border-ink bg-paper/95 py-2 backdrop-blur">
        {audioUrl ? (
          <audio
            ref={audio}
            src={audioUrl}
            controls
            preload="metadata"
            className="w-full"
            onTimeUpdate={onTime}
            onError={onAudioError}
            onLoadedMetadata={() => {
              if (pendingSeek.current !== null && audio.current) audio.current.currentTime = pendingSeek.current;
              pendingSeek.current = null;
            }}
          />
        ) : (
          <p className="text-sm text-muted">{audioMsg || "Loading audio."}</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section>
          <div className="mb-3 flex items-center gap-4">
            <h2 className="display text-2xl">Transcript</h2>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-rust" checked={showOriginal} onChange={(e) => setShowOriginal(e.target.checked)} />
              Show original
            </label>
          </div>
          {!m.segments.length && <p className="text-sm text-muted">Transcript appears here once processing reaches it.</p>}
          <ol className="space-y-1">
            {m.segments.map((s) => {
              const sp = s.speakerId ? speakers[s.speakerId] : null;
              const text = showOriginal ? s.text : s.editedText ?? s.text;
              const active = s.id === current;
              return (
                <li
                  key={s.id}
                  id={`seg-${s.id}`}
                  className={`group scroll-mt-24 border-l-4 px-3 py-2 ${active ? "border-rust bg-pink/60" : "border-transparent hover:bg-card"}`}
                >
                  <div className="flex items-baseline gap-3 text-xs">
                    <button className="chip" onClick={() => seek(s.id)}>{mmss(s.startMs)}</button>
                    <span className={`font-semibold ${SIDE_TONE[sp?.side ?? "UNKNOWN"]}`}>{speakerName(sp)}</span>
                    {s.editedText !== null && <span className="font-mono text-[10px] uppercase text-muted">edited</span>}
                    {editing !== s.id && (
                      <button className="link ml-auto text-muted opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => setEditing(s.id)}>
                        Edit
                      </button>
                    )}
                  </div>
                  {editing === s.id ? (
                    <SegmentEditor
                      initial={s.editedText ?? s.text}
                      original={s.text}
                      onCancel={() => setEditing(null)}
                      onSave={(editedText) =>
                        act(async () => {
                          await api(`/api/segments/${s.id}`, "PATCH", { editedText });
                          setEditing(null);
                        })
                      }
                    />
                  ) : (
                    <p className="mt-1 cursor-pointer whitespace-pre-wrap leading-relaxed" onClick={() => seek(s.id)}>
                      {text || <span className="text-muted">...</span>}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="space-y-6 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          {m.speakers.length > 0 && (
            <section className="card p-4">
              <h2 className="display mb-3 text-xl">Speakers</h2>
              <div className="space-y-2">
                {m.speakers.map((sp) => <SpeakerRow key={sp.id} meetingId={m.id} speaker={sp} onSaved={() => router.refresh()} />)}
              </div>
              {idle && m.findings.length + m.actionItems.length > 0 && (
                <p className="mt-3 text-xs text-muted">After renaming, re-run analysis so owners and commitments use the new names.</p>
              )}
            </section>
          )}

          <section className="card">
            <div className="flex flex-wrap border-b border-ink">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wider ${tab === t ? "bg-ink text-paper" : "hover:bg-pink"}`}
                >
                  {t}
                  {t === "Scope flags" && scope.some((f) => f.review === "UNREVIEWED") ? ` (${scope.filter((f) => f.review === "UNREVIEWED").length})` : ""}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab === "Summary" && (m.summary ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.summary}</p> : <Empty />)}
              {tab === "Decisions" && <CitedList items={m.decisions} time={time} onCite={seek} />}
              {tab === "Open questions" && <CitedList items={m.openQuestions} time={time} onCite={seek} />}
              {tab === "Action items" &&
                (m.actionItems.length ? m.actionItems.map((a) => <ActionItemRow key={a.id} item={a} time={time} onCite={seek} />) : <Empty />)}
              {tab === "Commitments" &&
                (commitments.length ? commitments.map((f) => <FindingRow key={f.id} finding={f} time={time} onCite={seek} />) : <Empty />)}
              {tab === "Scope flags" &&
                (scope.length ? (
                  scope.map((f) => <FindingRow key={f.id} finding={f} time={time} onCite={seek} />)
                ) : (
                  <Empty text={m.project.scopeBaseline ? undefined : "This project has no scope baseline, so scope is not checked."} />
                ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Empty({ text = "Nothing here yet." }: { text?: string }) {
  return <p className="text-sm text-muted">{text}</p>;
}

function CitedList({ items, time, onCite }: { items: Cited[]; time: Record<string, number>; onCite: (id: string) => void }) {
  if (!items.length) return <Empty />;
  return (
    <ul className="space-y-3">
      {items.map((d, i) => (
        <li key={i} className="border-b border-line pb-3 text-sm last:border-0">
          <p>{d.text}</p>
          <div className="mt-1"><Cites ids={d.segmentIds} time={time} onCite={onCite} /></div>
        </li>
      ))}
    </ul>
  );
}

function SegmentEditor({ initial, original, onSave, onCancel }: {
  initial: string; original: string; onSave: (t: string | null) => void; onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <div className="mt-1">
      <textarea autoFocus className="input min-h-20" value={v} onChange={(e) => setV(e.target.value)} />
      <div className="mt-1 flex gap-2">
        <button className="btn py-0.5" onClick={() => onSave(v)}>Save</button>
        <button className="btn-ghost py-0.5" onClick={onCancel}>Cancel</button>
        {initial !== original && <button className="link ml-auto text-xs" onClick={() => onSave(null)}>Revert to original</button>}
      </div>
    </div>
  );
}

function SpeakerRow({ meetingId, speaker, onSaved }: {
  meetingId: string;
  speaker: { id: string; label: string; displayName: string | null; side: string };
  onSaved: () => void;
}) {
  const [name, setName] = useState(speaker.displayName ?? "");
  const [side, setSide] = useState(speaker.side);
  const [error, setError] = useState("");
  const dirty = name !== (speaker.displayName ?? "") || side !== speaker.side;

  async function save() {
    setError("");
    try {
      await api(`/api/meetings/${meetingId}/speakers/${speaker.id}`, "PATCH", { displayName: name || null, side });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input className="input" placeholder={speaker.label} value={name} onChange={(e) => setName(e.target.value)} aria-label={`Name for ${speaker.label}`} />
        <select className="input w-28" value={side} onChange={(e) => setSide(e.target.value)} aria-label="Side">
          {SIDES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <button className="btn py-1" disabled={!dirty} onClick={save}>Save</button>
      </div>
      {error && <p className="text-xs text-alert">{error}</p>}
    </div>
  );
}
