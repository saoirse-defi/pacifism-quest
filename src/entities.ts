import Phaser from 'phaser';
import * as C from './config';
import { TEX_SCALE } from './textures';

const BASE_SCALE = 1 / TEX_SCALE;
const ADD = Phaser.BlendModes.ADD;

/** Reuses inactive entities instead of creating new ones. Release while iterating backwards. */
export class Pool<T extends { hide(): void }> {
  readonly live: T[] = [];
  private readonly free: T[] = [];

  constructor(private readonly create: () => T) {}

  obtain(): T {
    const item = this.free.pop() ?? this.create();
    this.live.push(item);
    return item;
  }

  /** Swap-removes the item at `index`, so iterate from the end when releasing in a loop. */
  release(index: number): void {
    const item = this.live[index];
    this.live[index] = this.live[this.live.length - 1];
    this.live.pop();
    item.hide();
    this.free.push(item);
  }
}

export class Player {
  readonly sprite: Phaser.GameObjects.Image;
  prevX: number;
  prevY: number;

  constructor(
    scene: Phaser.Scene,
    public x: number,
    public y: number,
  ) {
    this.prevX = x;
    this.prevY = y;
    this.sprite = scene.add.image(x, y, 'player').setScale(BASE_SCALE).setBlendMode(ADD).setDepth(5);
  }

  update(dt: number, targetX: number, targetY: number, followTime: number, width: number, height: number): void {
    this.prevX = this.x;
    this.prevY = this.y;
    // Frame-rate independent version of the original "move 1/25th of the way each frame".
    const t = 1 - Math.exp(-dt / followTime);
    const margin = C.PLAYER_SIZE / 2;
    this.x = Phaser.Math.Clamp(this.x + (targetX - this.x) * t, margin, width - margin);
    this.y = Phaser.Math.Clamp(this.y + (targetY - this.y) * t, margin, height - margin);
    this.sprite.setPosition(this.x, this.y);
    this.sprite.rotation += dt * 1.2;
  }
}

export class Enemy {
  readonly sprite: Phaser.GameObjects.Image;
  x = 0;
  y = 0;
  age = 0;
  sepX = 0;
  sepY = 0;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, 'enemy').setBlendMode(ADD).setDepth(3);
    this.hide();
  }

  get armed(): boolean {
    return this.age >= C.ENEMY_ARM_TIME;
  }

  spawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.age = 0;
    this.sprite.setActive(true).setVisible(true).setScale(0);
  }

  render(headingX: number, headingY: number): void {
    const grow = Math.min(1, this.age / C.ENEMY_SPAWN_ANIM_TIME);
    const pop = grow < 1 ? Phaser.Math.Easing.Back.Out(grow) : 1;
    this.sprite
      .setPosition(this.x, this.y)
      .setRotation(Math.atan2(headingY, headingX))
      .setScale(BASE_SCALE * pop)
      .setAlpha(this.armed ? 1 : 0.45 + 0.35 * Math.abs(Math.sin(this.age * 14)));
  }

  hide(): void {
    this.sprite.setActive(false).setVisible(false);
  }
}

export class Gem {
  readonly sprite: Phaser.GameObjects.Image;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  age = 0;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, 'gem').setBlendMode(ADD).setDepth(2);
    this.hide();
  }

  get expired(): boolean {
    return this.age >= C.GEM_LIFETIME;
  }

  spawn(x: number, y: number): void {
    const angle = Math.random() * Math.PI * 2;
    const speed = Phaser.Math.FloatBetween(40, 140);
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.age = 0;
    this.sprite.setActive(true).setVisible(true);
  }

  render(): void {
    const blinking = C.GEM_LIFETIME - this.age < C.GEM_BLINK_TIME && Math.floor(this.age * 10) % 2 === 0;
    this.sprite
      .setPosition(this.x, this.y)
      .setRotation(this.age * 3)
      .setScale(BASE_SCALE * (1 + 0.12 * Math.sin(this.age * 8)))
      .setAlpha(blinking ? 0.25 : 1);
  }

  hide(): void {
    this.sprite.setActive(false).setVisible(false);
  }
}

export type GateHit = 'mine' | 'clear' | null;

/** Distance from point (px, py) to the segment (ax, ay)–(bx, by). */
function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Phaser.Math.Clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export class Gate {
  readonly sprite: Phaser.GameObjects.Image;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  spin = 0;
  age = 0;

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, 'gate').setScale(BASE_SCALE).setBlendMode(ADD).setDepth(1);
    this.hide();
  }

  get armed(): boolean {
    return this.age >= C.GATE_ARM_TIME;
  }

  spawn(x: number, y: number): void {
    const heading = Math.random() * Math.PI * 2;
    const speed = Phaser.Math.FloatBetween(C.GATE_SPEED_MIN, C.GATE_SPEED_MAX);
    this.x = x;
    this.y = y;
    this.vx = Math.cos(heading) * speed;
    this.vy = Math.sin(heading) * speed;
    this.spin = Phaser.Math.FloatBetween(C.GATE_SPIN_MIN, C.GATE_SPIN_MAX) * (Math.random() < 0.5 ? -1 : 1);
    this.age = 0;
    this.sprite.setActive(true).setVisible(true).setRotation(Math.random() * Math.PI);
  }

  /** Drifts, spins and bounces off the edges of the playfield. */
  step(dt: number, width: number, height: number): void {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.sprite.rotation += this.spin * dt;

    const extentX = Math.abs(Math.cos(this.sprite.rotation)) * C.GATE_HALF_LENGTH + C.MINE_RADIUS;
    const extentY = Math.abs(Math.sin(this.sprite.rotation)) * C.GATE_HALF_LENGTH + C.MINE_RADIUS;
    if (this.x < extentX) {
      this.x = extentX;
      this.vx = Math.abs(this.vx);
    } else if (this.x > width - extentX) {
      this.x = width - extentX;
      this.vx = -Math.abs(this.vx);
    }
    if (this.y < extentY) {
      this.y = extentY;
      this.vy = Math.abs(this.vy);
    } else if (this.y > height - extentY) {
      this.y = height - extentY;
      this.vy = -Math.abs(this.vy);
    }

    const alpha = this.armed ? 1 : Math.sin(this.age * 18) > 0 ? 0.75 : 0.3;
    this.sprite.setPosition(this.x, this.y).setAlpha(alpha);
  }

  /**
   * Tests the ship's movement this frame against the gate, in the gate's rotated frame.
   * Both checks use the whole path since last frame, so a fast move can't skip a mine or the bar.
   */
  test(fromX: number, fromY: number, toX: number, toY: number): GateHit {
    const cos = Math.cos(this.sprite.rotation);
    const sin = Math.sin(this.sprite.rotation);
    const localX = (x: number, y: number) => (x - this.x) * cos + (y - this.y) * sin;
    const localY = (x: number, y: number) => -(x - this.x) * sin + (y - this.y) * cos;

    const lx = localX(toX, toY);
    const ly = localY(toX, toY);
    const ox = localX(fromX, fromY);
    const oy = localY(fromX, fromY);

    // Any overlap between the ship's ring and a mine (spikes included) is fatal.
    if (this.armed) {
      const reach = C.MINE_HIT_RADIUS + C.PLAYER_HIT_RADIUS;
      for (const mineX of [-C.GATE_HALF_LENGTH, C.GATE_HALF_LENGTH]) {
        if (distanceToSegment(mineX, 0, ox, oy, lx, ly) < reach) return 'mine';
      }
    }

    const inner = C.GATE_HALF_LENGTH - C.MINE_RADIUS;
    if (Math.abs(lx) < inner && Math.abs(ly) < C.GATE_CLEAR_HALF_WIDTH) return 'clear';

    if (oy < 0 !== ly < 0 && oy !== ly) {
      const crossX = ox + (lx - ox) * (oy / (oy - ly));
      if (Math.abs(crossX) < inner) return 'clear';
    }
    return null;
  }

  hide(): void {
    this.sprite.setActive(false).setVisible(false);
  }
}
