"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type Project = { id: string; name: string; scopeBaseline: string | null; _count: { meetings: number } };
type Client = { id: string; name: string; projects: Project[]; vocabulary: { id: string; term: string }[] };

function useAct() {
  const router = useRouter();
  const [error, setError] = useState("");
  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      router.refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  return { act, error };
}

export function ClientsAdmin({ clients }: { clients: Client[] }) {
  const { act, error } = useAct();
  const [name, setName] = useState("");
  return (
    <div className="space-y-6">
      <form
        className="flex max-w-md gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act(() => api("/api/clients", "POST", { name }))) setName("");
        }}
      >
        <input className="input" placeholder="New client name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="btn">Add client</button>
      </form>
      {error && <p className="text-sm text-alert">{error}</p>}
      {clients.map((c) => <ClientCard key={c.id} client={c} />)}
    </div>
  );
}

function ClientCard({ client: c }: { client: Client }) {
  const { act, error } = useAct();
  const [terms, setTerms] = useState("");
  const [project, setProject] = useState("");
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="display text-2xl">{c.name}</h2>
        <button className="link text-xs" onClick={() => {
          const name = prompt("Client name", c.name);
          if (name) act(() => api(`/api/clients/${c.id}`, "PATCH", { name }));
        }}>Rename</button>
        {!c.projects.length && (
          <button className="link text-xs text-alert" onClick={() => confirm(`Delete ${c.name}?`) && act(() => api(`/api/clients/${c.id}`, "DELETE"))}>
            Delete
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-alert">{error}</p>}

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <h3 className="label">Projects</h3>
          <div className="space-y-3">
            {c.projects.map((p) => <ProjectRow key={p.id} project={p} />)}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act(() => api("/api/projects", "POST", { clientId: c.id, name: project }))) setProject("");
            }}
          >
            <input className="input" placeholder="New project name" value={project} onChange={(e) => setProject(e.target.value)} required />
            <button className="btn-ghost">Add project</button>
          </form>
        </div>

        <div>
          <h3 className="label">Vocabulary</h3>
          <p className="mb-2 text-xs text-muted">Names, products and module names. Passed to the analysis prompt.</p>
          <div className="mb-2 flex flex-wrap gap-1">
            {c.vocabulary.map((v) => (
              <span key={v.id} className="inline-flex items-center gap-1 border border-line bg-paper px-1.5 py-0.5 text-xs">
                {v.term}
                <button aria-label={`Remove ${v.term}`} className="cursor-pointer text-muted hover:text-alert" onClick={() => act(() => api(`/api/vocab/${v.id}`, "DELETE"))}>x</button>
              </span>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act(() => api("/api/vocab", "POST", { clientId: c.id, terms }))) setTerms("");
            }}
          >
            <input className="input" placeholder="Terms, comma separated" value={terms} onChange={(e) => setTerms(e.target.value)} required />
            <button className="btn-ghost">Add</button>
          </form>
        </div>
      </div>
    </section>
  );
}

function ProjectRow({ project: p }: { project: Project }) {
  const { act, error } = useAct();
  const [name, setName] = useState(p.name);
  const [baseline, setBaseline] = useState(p.scopeBaseline ?? "");
  const [open, setOpen] = useState(false);
  const dirty = name !== p.name || baseline !== (p.scopeBaseline ?? "");
  return (
    <div className="border border-line bg-paper p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
        <span className="text-xs text-muted">{p._count.meetings} meetings  ·  {p.scopeBaseline ? "has scope baseline" : "no scope baseline"}</span>
        <button className="link ml-auto text-xs" onClick={() => setOpen(!open)}>{open ? "Hide baseline" : "Edit baseline"}</button>
        {!p._count.meetings && (
          <button className="link text-xs text-alert" onClick={() => confirm(`Delete ${p.name}?`) && act(() => api(`/api/projects/${p.id}`, "DELETE"))}>
            Delete
          </button>
        )}
      </div>
      {open && (
        <textarea
          className="input mt-2 min-h-40 font-mono text-xs"
          placeholder="Paste the SOW or describe what is in scope. Used to flag scope changes."
          value={baseline}
          onChange={(e) => setBaseline(e.target.value)}
        />
      )}
      {dirty && (
        <button className="btn mt-2" onClick={() => act(() => api(`/api/projects/${p.id}`, "PATCH", { name, scopeBaseline: baseline || null }))}>
          Save
        </button>
      )}
      {error && <p className="mt-1 text-xs text-alert">{error}</p>}
    </div>
  );
}
