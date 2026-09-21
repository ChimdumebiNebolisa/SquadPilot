"use client";

export function SquadLoadingSkeleton() {
  return (
    <section aria-label="Generating squad" aria-busy="true" className="rounded-2xl border border-border/50 bg-panel/40 p-3">
      <div className="mb-3 h-4 w-24 animate-pulse rounded bg-border/50" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-12 animate-pulse rounded-lg bg-panel" aria-hidden />
        ))}
      </div>
    </section>
  );
}
