import { db } from "./db";

export type SearchHit = {
  id: string;
  meetingId: string;
  startMs: number;
  title: string;
  meetingDate: Date;
  client: string;
  project: string;
  snippet: string;
};

// Snippet marks matches with << >>; the UI splits on them instead of rendering HTML.
export function searchSegments(q: string, clientId?: string | null, projectId?: string | null) {
  if (!q.trim()) return Promise.resolve([] as SearchHit[]);
  const c = clientId || null;
  const p = projectId || null;
  return db.$queryRaw<SearchHit[]>`
    SELECT s.id, s."meetingId", s."startMs", m.title, m."meetingDate", cl.name AS client, pr.name AS project,
      ts_headline('simple', coalesce(s."editedText", s.text), query,
        'StartSel=<<,StopSel=>>,MaxWords=30,MinWords=12') AS snippet
    FROM "Segment" s
    JOIN "Meeting" m ON m.id = s."meetingId"
    JOIN "Project" pr ON pr.id = m."projectId"
    JOIN "Client" cl ON cl.id = pr."clientId",
    websearch_to_tsquery('simple', ${q}) query
    WHERE s.search @@ query
      AND (${c}::text IS NULL OR cl.id = ${c})
      AND (${p}::text IS NULL OR pr.id = ${p})
    ORDER BY ts_rank(s.search, query) DESC, m."meetingDate" DESC
    LIMIT 100`;
}
