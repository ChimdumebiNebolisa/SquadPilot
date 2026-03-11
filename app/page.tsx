export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <header className="rounded-card border border-border bg-panel p-6">
          <p className="text-sm text-muted">FPL SquadPilot</p>
          <h1 className="mt-2 text-3xl font-semibold">Next Gameweek Recommender</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Generate one projected squad recommendation with a clear, explainable output for the next gameweek.
          </p>
        </header>

        <section className="rounded-card border border-border bg-panel p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <label htmlFor="teamId" className="text-sm font-medium">
                FPL Team ID (optional)
              </label>
              <input
                id="teamId"
                name="teamId"
                inputMode="numeric"
                placeholder="e.g. 1234567"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none ring-brand/30 transition focus:ring-2"
              />
            </div>
            <button
              type="button"
              className="h-11 rounded-xl bg-brand px-5 text-sm font-medium text-brand-foreground transition hover:opacity-90"
            >
              Generate Squad
            </button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-card border border-dashed border-border bg-panel p-5 lg:col-span-2">
            <h2 className="text-lg font-semibold">Recommendation Placeholder</h2>
            <p className="mt-2 text-sm text-muted">
              Your recommended starting XI, captain, vice-captain, and bench will appear here.
            </p>
          </article>
          <article className="rounded-card border border-dashed border-border bg-panel p-5">
            <h2 className="text-lg font-semibold">Status</h2>
            <p className="mt-2 text-sm text-muted">Awaiting generation request.</p>
          </article>
        </section>
      </main>
    </div>
  );
}
