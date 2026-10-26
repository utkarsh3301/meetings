export function PageTitle({ children, sub, right }: { children: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="relative mb-6 flex flex-wrap items-end gap-4">
      <div aria-hidden className="stipple-rust fade-right pointer-events-none absolute -left-2 bottom-1 h-6 w-64 opacity-60" />
      <div className="relative">
        <h1 className="display text-4xl sm:text-5xl">{children}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {right && <div className="relative ml-auto flex flex-wrap gap-2">{right}</div>}
    </div>
  );
}
