const FPL_BASE_URL = "https://fantasy.premierleague.com/api";

export class FplHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchFplJson<T>(path: string): Promise<T> {
  const response = await fetch(`${FPL_BASE_URL}${path}`, {
    next: { revalidate: 60 },
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new FplHttpError(response.status, `FPL request failed for ${path}`);
  }

  return (await response.json()) as T;
}

export async function fetchBootstrapStatic(): Promise<unknown> {
  return fetchFplJson<unknown>("/bootstrap-static/");
}

export async function fetchFixturesForEvent(eventId: number): Promise<unknown> {
  return fetchFplJson<unknown>(`/fixtures/?event=${eventId}`);
}

export async function fetchEntryPicks(teamId: string, gameweek: number): Promise<unknown> {
  return fetchFplJson<unknown>(`/entry/${teamId}/event/${gameweek}/picks/`);
}