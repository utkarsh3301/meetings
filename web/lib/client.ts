// Browser-side JSON fetch that throws the API's error message.
export async function api<T = unknown>(url: string, method = "POST", data?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: data === undefined ? undefined : { "content-type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || `Request failed (${r.status})`);
  }
  return (r.status === 204 ? null : await r.json()) as T;
}
