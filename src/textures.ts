import Phaser from 'phaser';
import {
  COLORS,
  ENEMY_SIZE,
  GATE_HALF_LENGTH,
  GEM_SIZE,
  MINE_HIT_RADIUS,
  MINE_RADIUS,
  PLAYER_NUB_RADIUS,
  PLAYER_RADIUS,
  PLAYER_RING_WIDTH,
  PLAYER_SIZE,
  RING_RADIUS,
} from './config';

/** Textures are drawn at twice their world size so they stay crisp on high-DPI screens. */
export const TEX_SCALE = 2;
const GLOW_PAD = 14;

type Ctx = CanvasRenderingContext2D;

const rgba = (color: number, alpha = 1) =>
  `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`;

/** Creates a canvas texture with the origin at its centre and world-unit coordinates. */
function paint(scene: Phaser.Scene, key: string, width: number, height: number, draw: (ctx: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const pixelWidth = Math.ceil(width * TEX_SCALE);
  const pixelHeight = Math.ceil(height * TEX_SCALE);
  const texture = scene.textures.createCanvas(key, pixelWidth, pixelHeight);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.setTransform(TEX_SCALE, 0, 0, TEX_SCALE, pixelWidth / 2, pixelHeight / 2);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  texture.refresh();
}

/** Draws a shape twice with a coloured shadow for a neon glow. */
function glow(ctx: Ctx, color: string, blur: number, draw: () => void): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * TEX_SCALE; // shadowBlur ignores the transform
  draw();
  draw();
  ctx.restore();
}

function circle(ctx: Ctx, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
}

function drawPlayer(ctx: Ctx): void {
  const r = PLAYER_RADIUS;
  const hub = r * 0.5;
  const color = rgba(COLORS.player);
  glow(ctx, color, 10, () => {
    ctx.strokeStyle = color;
    ctx.lineWidth = PLAYER_RING_WIDTH;
    circle(ctx, 0, 0, r);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.lineTo(Math.cos(a) * hub, Math.sin(a) * hub);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.moveTo(Math.cos(a) * hub, Math.sin(a) * hub);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
  });
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    circle(ctx, Math.cos(a) * r, Math.sin(a) * r, PLAYER_NUB_RADIUS);
    ctx.fill();
  }
  circle(ctx, 0, 0, 3.5);
  ctx.fill();
}

/** An arrowhead drone pointing along +x, so rotation = heading. */
function drawEnemy(ctx: Ctx): void {
  const s = ENEMY_SIZE / 2;
  const color = rgba(COLORS.enemy);
  glow(ctx, color, 9, () => {
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.75, -s * 0.9);
    ctx.lineTo(-s * 0.3, 0);
    ctx.lineTo(-s * 0.75, s * 0.9);
    ctx.closePath();
    ctx.fillStyle = rgba(COLORS.enemy, 0.2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  });
  ctx.strokeStyle = rgba(0xffffff, 0.7);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, 0);
  ctx.lineTo(s * 0.55, 0);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  circle(ctx, s * 0.2, 0, 2.8);
  ctx.fill();
}

function drawGem(ctx: Ctx): void {
  const h = GEM_SIZE / 2;
  const color = rgba(COLORS.gem);
  glow(ctx, color, 8, () => {
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(h * 0.65, 0);
    ctx.lineTo(0, h);
    ctx.lineTo(-h * 0.65, 0);
    ctx.closePath();
    ctx.fillStyle = rgba(COLORS.gem, 0.35);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  ctx.fillStyle = '#ffffff';
  circle(ctx, 0, 0, 1.6);
  ctx.fill();
}

/** A horizontal energy bar with a mine at each end. */
function drawGate(ctx: Ctx): void {
  const inner = GATE_HALF_LENGTH - MINE_RADIUS - 2;
  const bar = rgba(COLORS.gate);
  ctx.fillStyle = rgba(COLORS.gate, 0.12);
  ctx.fillRect(-inner, -5, inner * 2, 10);
  glow(ctx, bar, 8, () => {
    ctx.strokeStyle = bar;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-inner, 0);
    ctx.lineTo(inner, 0);
    ctx.stroke();
  });
  ctx.strokeStyle = rgba(COLORS.gate, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-inner, -5);
  ctx.lineTo(inner, -5);
  ctx.moveTo(-inner, 5);
  ctx.lineTo(inner, 5);
  ctx.stroke();

  const mine = rgba(COLORS.mine);
  for (const x of [-GATE_HALF_LENGTH, GATE_HALF_LENGTH]) {
    glow(ctx, mine, 9, () => {
      circle(ctx, x, 0, MINE_RADIUS - 1);
      ctx.fillStyle = rgba(COLORS.mine, 0.35);
      ctx.fill();
      ctx.strokeStyle = mine;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });
    ctx.strokeStyle = mine;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.moveTo(x + Math.cos(a) * (MINE_RADIUS + 1), Math.sin(a) * (MINE_RADIUS + 1));
      // Spike tips end exactly at MINE_HIT_RADIUS, including the line's rounded cap.
      const tip = MINE_HIT_RADIUS - ctx.lineWidth / 2;
      ctx.lineTo(x + Math.cos(a) * tip, Math.sin(a) * tip);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    circle(ctx, x, 0, 3.5);
    ctx.fill();
  }
}

function drawSpark(ctx: Ctx): void {
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 6);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(-6, -6, 12, 12);
}

function drawRing(ctx: Ctx): void {
  glow(ctx, '#ffffff', 10, () => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    circle(ctx, 0, 0, RING_RADIUS);
    ctx.stroke();
  });
}

/** Generates every sprite in code; white textures (spark, ring) are tinted at runtime. */
export function createTextures(scene: Phaser.Scene): void {
  const pad = GLOW_PAD * 2;
  paint(scene, 'player', PLAYER_SIZE + pad, PLAYER_SIZE + pad, drawPlayer);
  paint(scene, 'enemy', ENEMY_SIZE + pad, ENEMY_SIZE + pad, drawEnemy);
  paint(scene, 'gem', GEM_SIZE + pad, GEM_SIZE + pad, drawGem);
  paint(scene, 'gate', (GATE_HALF_LENGTH + MINE_HIT_RADIUS) * 2 + pad, MINE_HIT_RADIUS * 2 + pad, drawGate);
  paint(scene, 'spark', 12, 12, drawSpark);
  paint(scene, 'ring', RING_RADIUS * 2 + pad, RING_RADIUS * 2 + pad, drawRing);
}
