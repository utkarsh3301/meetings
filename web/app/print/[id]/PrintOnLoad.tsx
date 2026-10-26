"use client";

import { useEffect } from "react";

export function PrintOnLoad() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return (
    <p className="no-print mb-6 border border-line bg-paper px-3 py-2 text-xs text-muted">
      Choose &quot;Save as PDF&quot; in the print dialog.
    </p>
  );
}
