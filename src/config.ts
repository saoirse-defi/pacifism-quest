// Tuning values. Distances are in world units (≈ CSS pixels on a desktop screen),
// times are in seconds and speeds in units per second.
//
// The leaderboard server re-checks scores using copies of the difficulty levels, points and
// wave schedule (server/api/lib.php). Change those there too, or real scores will be rejected.

/** The playfield is scaled so its shortest side is at least this many world units. */
export const DESIGN_SHORT_SIDE = 820;

export interface Difficulty {
  name: string;
  /** Multiplies the final score, so faster games are worth more. */
  level: number;
  enemySpeed: number;
  color: string;
}

// Speeds match the original game's per-frame speeds at 60fps (level × 60).
export const DIFFICULTIES: Difficulty[] = [
  { name: 'Amateur', level: 3, enemySpeed: 180, color: '#7dff8a' },
  { name: 'Semi-Pro', level: 4, enemySpeed: 240, color: '#c6ff5a' },
  { name: 'Professional', level: 5, enemySpeed: 300, color: '#ffe066' },
  { name: 'Veteran', level: 6, enemySpeed: 360, color: '#ffaa3c' },
  { name: 'Legendary', level: 7, enemySpeed: 420, color: '#ff5a4a' },
  { name: 'God Mode', level: 8, enemySpeed: 480, color: '#ff3ccf' },
];
export const DEFAULT_DIFFICULTY = 2;

export const BACKGROUNDS = ['stars', 'stars1', 'stars2', 'stars3', 'stars4', 'nebula01', 'nebula02', 'nebula10'];
export const backgroundKey = (index: number) => `bg-${BACKGROUNDS[index]}`;

export const COLORS = {
  player: 0x55eeff,
  enemy: 0xff3ccf,
  gem: 0x9dff4a,
  gate: 0xffe066,
  mine: 0xff8a1f,
};

export const FONT_TITLE = 'Orbitron';
export const FONT_BODY = 'DotGothic16';

// Player
export const PLAYER_SIZE = 52;
/** Radius of the ship's outer ring (centre of its line), the line's width, and the dots that sit on it. */
export const PLAYER_RADIUS = PLAYER_SIZE / 2 - 2;
export const PLAYER_RING_WIDTH = 3;
export const PLAYER_NUB_RADIUS = 2.5;
/** The outermost drawn point of the ship (the dots on its ring), so the hitbox matches what you see. */
export const PLAYER_HIT_RADIUS = PLAYER_RADIUS + PLAYER_NUB_RADIUS;
/** Time constant of the ship chasing the cursor (the original used 1/25 per frame ≈ 0.42s). */
export const MOUSE_FOLLOW_TIME = 0.3;
export const TOUCH_FOLLOW_TIME = 0.08;
/** World units moved per unit of finger drag. */
export const TOUCH_SENSITIVITY = 1.6;
/** Ship speed with the controller stick fully pushed (faster than the fastest enemies). */
export const PAD_SPEED = 560;
export const PAD_DEADZONE = 0.2;
export const PAD_FOLLOW_TIME = 0.08;

// Enemies
export const ENEMY_SIZE = 40;
/** Matches the drone's drawn body (~38 units across); only the very tips of the wings poke outside. */
export const ENEMY_HIT_RADIUS = 18;
/** Enemies can't hurt you for this long after spawning. */
export const ENEMY_ARM_TIME = 1;
export const ENEMY_SPAWN_ANIM_TIME = 0.35;
export const ENEMY_SEPARATION = 34;
export const ENEMY_SEPARATION_FORCE = 220;
export const MAX_ENEMIES = 400;

// Waves: one wave every WAVE_INTERVAL from a random corner, growing by one enemy every
// WAVE_GROWTH_TIME up to MAX_WAVE_SIZE. After that, waves arrive gradually faster.
export const FIRST_WAVE_DELAY = 0.6;
export const WAVE_INTERVAL = 100 / 60;
export const MIN_WAVE_INTERVAL = 0.9;
export const WAVE_GROWTH_TIME = 1000 / 60;
export const MAX_WAVE_SIZE = 9;
export const WAVE_RAMP_RATE = 0.004;
export const CORNER_INSET = 50;
export const CORNER_SPREAD = 70;
/** Waves never spawn in a corner the player is closer to than this. */
export const CORNER_SAFE_DISTANCE = 320;

// Gates
/** Distance from the gate's centre to each mine. */
export const GATE_HALF_LENGTH = 75;
export const MINE_RADIUS = 10;
/** Length of the spikes drawn around each mine. */
export const MINE_SPIKE_LENGTH = 4;
/** The mine's full drawn size, spikes included: any contact with the ship's ring is fatal. */
export const MINE_HIT_RADIUS = MINE_RADIUS + MINE_SPIKE_LENGTH;
/** How close to the bar the ship's centre must be to count as passing through: its ring touching the bar. */
export const GATE_CLEAR_HALF_WIDTH = PLAYER_RADIUS;
/** Mines are harmless for this long after a gate spawns. */
export const GATE_ARM_TIME = 2;
/** Gates stay until cleared; new ones stop spawning while this many are on screen. */
export const MAX_GATES = 7;
export const GATE_SAFE_SPAWN_DISTANCE = 260;
export const GATE_SPEED_MIN = 25;
export const GATE_SPEED_MAX = 70;
export const GATE_SPIN_MIN = 0.25;
export const GATE_SPIN_MAX = 0.8;
/** Enemies within this distance of the player die when a gate is cleared. */
export const BLAST_RADIUS = 200;

// Gems
export const GEM_SIZE = 18;
export const GEM_ATTRACT_RADIUS = 150;
export const GEM_ATTRACT_SPEED = 600;
export const GEM_COLLECT_RADIUS = 24;
export const GEM_LIFETIME = 7;
export const GEM_BLINK_TIME = 2;

// Scoring: total = points × multiplier × difficulty level
export const POINTS_PER_ENEMY = 50;
export const POINTS_PER_GATE = 20;

/** Radius the shockwave ring texture is drawn at. */
export const RING_RADIUS = 120;
