"use client";

export function PitchSkeleton() {
  const rows = [
    { count: 1, label: "GK" },
    { count: 4, label: "DEF" },
    { count: 4, label: "MID" },
    { count: 2, label: "FWD" },
  ];

  return (
    <div className="perspective-pitch-wrapper w-full">
      <div className="perspective-pitch-surface rounded-2xl border border-border/50 p-4 md:p-5">
        <div
          className="pointer-events-none absolute left-1/2 top-[20%] h-12 w-12 -translate-x-1/2 rounded-full border border-[var(--pitch-line)] opacity-50"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-4 right-4 top-1/2 h-px bg-[var(--pitch-line)] opacity-50"
          aria-hidden
        />

        <div className="relative flex flex-col items-center gap-3 md:gap-4">
          {rows.map(({ count, label }) => (
            <div
              key={label}
              className="grid w-full gap-2 md:gap-2.5"
              style={{
                gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
                maxWidth: count === 1 ? "140px" : count === 4 ? "380px" : "320px",
                margin: "0 auto",
              }}
            >
              {Array.from({ length: count }).map((_, i) => (
                <div
                  key={i}
                  className="h-[64px] animate-pulse rounded-xl bg-panel/80"
                  aria-hidden
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-0 rounded-b-2xl border border-t-0 border-border/50 bg-panel/80 px-4 py-3">
        <div className="mb-2 h-3 w-16 animate-pulse rounded bg-border/50" />
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-panel" aria-hidden />
          ))}
        </div>
      </div>
    </div>
  );
}
