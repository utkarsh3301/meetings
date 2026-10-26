"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { label, LANGUAGES, MEETING_TYPES } from "@/lib/format";

type ClientOpt = { id: string; name: string; projects: { id: string; name: string }[] };

function put(url: string, file: File, contentType: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and the bucket CORS settings."));
    xhr.send(file);
  });
}

export function UploadForm({ clients, maxMb }: { clients: ClientOpt[]; maxMb: number }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const projects = clients.find((c) => c.id === clientId)?.projects ?? [];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const file = f.get("file") as File;
    if (file.size > maxMb * 1024 * 1024) return setError(`File is over ${maxMb} MB.`);
    try {
      setProgress(0);
      const pre = await api<{ key: string; url: string; contentType: string }>("/api/uploads/presign", "POST", {
        filename: file.name,
        contentType: file.type,
        size: file.size,
      });
      await put(pre.url, file, pre.contentType, setProgress);
      const m = await api<{ id: string }>("/api/meetings", "POST", {
        projectId: f.get("projectId"),
        title: f.get("title"),
        meetingDate: f.get("meetingDate"),
        type: f.get("type"),
        languageHint: f.get("languageHint"),
        consentGiven: f.get("consent") === "on",
        audioKey: pre.key,
      });
      router.push(`/meetings/${m.id}`);
    } catch (err) {
      setProgress(null);
      setError((err as Error).message);
    }
  }

  if (!clients.length) return <p className="text-muted">No clients yet. An admin needs to add a client and project first.</p>;
  const busy = progress !== null;

  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-4 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Client</span>
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Project</span>
          <select name="projectId" className="input" required key={clientId}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {!projects.length && <span className="mt-1 block text-xs text-alert">This client has no projects.</span>}
        </label>
      </div>
      <label className="block">
        <span className="label">Title</span>
        <input name="title" className="input" required maxLength={200} />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="label">Date</span>
          <input name="meetingDate" type="date" className="input" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
        <label className="block">
          <span className="label">Type</span>
          <select name="type" className="input" defaultValue="STATUS">
            {MEETING_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Language</span>
          <select name="languageHint" className="input" defaultValue="multi">
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Recording</span>
        <input name="file" type="file" required accept=".mp3,.m4a,.wav,.mp4,.webm,audio/*,video/mp4,video/webm" className="input file:mr-3 file:border-0 file:bg-ink file:px-2 file:py-1 file:text-paper" />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input name="consent" type="checkbox" required className="mt-1 accent-rust" />
        <span>All participants agreed to this meeting being recorded and processed.</span>
      </label>

      {busy && (
        <div>
          <div className="h-3 border border-ink bg-paper" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="stipple h-full bg-tan" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-1 font-mono text-xs text-muted">{Math.round(progress * 100)}% uploaded</p>
        </div>
      )}
      {error && <p className="text-sm text-alert">{error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <button className="btn" disabled={busy || !projects.length}>{busy ? "Uploading" : "Upload"}</button>
        <p className="text-xs text-muted">Audio is processed via NVIDIA hosted models.</p>
      </div>
    </form>
  );
}
