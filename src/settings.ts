import { BACKGROUNDS, DEFAULT_DIFFICULTY, DIFFICULTIES } from './config';

export interface Settings {
  highScore: number;
  difficulty: number;
  background: number;
  muted: boolean;
  /** Last name entered for the online leaderboard. */
  playerName: string;
}

const STORAGE_KEY = 'against-all-odds:settings';

const isIndex = (value: unknown, length: number): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;

function load(): Settings {
  const settings: Settings = { highScore: 0, difficulty: DEFAULT_DIFFICULTY, background: 0, muted: false, playerName: '' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
    if (Number.isFinite(saved.highScore)) settings.highScore = Math.max(0, Math.floor(saved.highScore!));
    if (isIndex(saved.difficulty, DIFFICULTIES.length)) settings.difficulty = saved.difficulty;
    if (isIndex(saved.background, BACKGROUNDS.length)) settings.background = saved.background;
    settings.muted = saved.muted === true;
    if (typeof saved.playerName === 'string') settings.playerName = saved.playerName.slice(0, 12);
  } catch {
    // Storage blocked (private mode) or corrupt: fall back to defaults.
  }
  return settings;
}

export const settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable; settings just won't persist.
  }
}
