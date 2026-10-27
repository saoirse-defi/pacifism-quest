// Client for the PHP leaderboard API in server/api. Every call fails soft: if the API is
// unreachable (offline, local dev without PHP), the game carries on with local high scores.

const API_URL: string = import.meta.env.VITE_API_URL ?? 'api/';

export interface ScoreEntry {
  name: string;
  score: number;
  date: string;
}

export interface RunStats {
  kills: number;
  gates: number;
  gems: number;
  durationMs: number;
}

export interface SubmitResult {
  score: number;
  rank: number;
}

/** Names the server will accept (it re-checks everything, plus a profanity filter). */
export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{2,11}$/;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, init);
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || body === null) throw new Error(body?.error ?? 'The leaderboard is unavailable right now');
  return body;
}

const post = <T>(path: string, data: unknown) =>
  request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

/** Registers a new run with the server; resolves to null if the leaderboard can't be reached. */
export async function startRun(difficulty: number): Promise<string | null> {
  try {
    const { runId } = await post<{ runId: unknown }>('start.php', { difficulty });
    return typeof runId === 'string' ? runId : null;
  } catch {
    return null;
  }
}

export function submitScore(runId: string, name: string, stats: RunStats, turnstileToken?: string): Promise<SubmitResult> {
  return post<SubmitResult>('submit.php', { runId, name, ...stats, turnstileToken });
}

export async function topScores(difficulty: number): Promise<ScoreEntry[]> {
  const { scores } = await request<{ scores: ScoreEntry[] }>(`leaderboard.php?difficulty=${difficulty}`);
  return Array.isArray(scores) ? scores : [];
}
