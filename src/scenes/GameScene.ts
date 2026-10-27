import Phaser from 'phaser';
import { audio } from '../audio';
import * as C from '../config';
import { Backdrop } from '../backdrop';
import { Enemy, Gate, Gem, Player, Pool } from '../entities';
import { onPadButtons, PAD } from '../gamepad';
import { saveSettings, settings } from '../settings';
import { Steering } from '../steering';
import { TEX_SCALE } from '../textures';
import { addButton, addText, formatNumber, toggleMute } from '../ui';
import { applyView, View } from '../view';

type State = 'playing' | 'dying' | 'over';
type SparkKind = 'enemy' | 'gem' | 'gate' | 'player';

const HUD_MARGIN = 24;
/** After death the world keeps moving in slow motion behind the game-over screen. */
const AFTERLIFE_TIME_SCALE = 0.15;

export class GameScene extends Phaser.Scene {
  private view!: View;
  private backdrop!: Backdrop;
  private player!: Player;
  private steering!: Steering;
  private enemies!: Pool<Enemy>;
  private gems!: Pool<Gem>;
  private gates!: Pool<Gate>;
  private sparks!: Record<SparkKind, Phaser.GameObjects.Particles.ParticleEmitter>;

  private scoreText!: Phaser.GameObjects.Text;
  private multiplierText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private difficultyText!: Phaser.GameObjects.Text;
  private pauseButton!: Phaser.GameObjects.Container;
  private overlay?: Phaser.GameObjects.Container;

  private state: State = 'playing';
  private paused = false;
  private elapsed = 0;
  private waveTimer = 0;
  private score = 0;
  private multiplier = 1;
  private shownTotal = -1;
  private coinChain = 0;
  private lastGemAt = -Infinity;
  private lastCoinSoundAt = -Infinity;

  constructor() {
    super('game');
  }

  init(): void {
    this.state = 'playing';
    this.paused = false;
    this.elapsed = 0;
    this.waveTimer = C.FIRST_WAVE_DELAY;
    this.score = 0;
    this.multiplier = 1;
    this.shownTotal = -1;
    this.coinChain = 0;
    this.lastGemAt = -Infinity;
    this.lastCoinSoundAt = -Infinity;
    this.overlay = undefined;
  }

  private get difficulty(): C.Difficulty {
    return C.DIFFICULTIES[settings.difficulty];
  }

  private get total(): number {
    return this.score * this.multiplier * this.difficulty.level;
  }

  create(): void {
    audio.setMusic('game');
    this.view = applyView(this);
    this.backdrop = new Backdrop(this);
    const { width, height } = this.view;
    this.player = new Player(this, width / 2, height / 2);
    this.steering = new Steering(this, width / 2, height / 2);
    this.enemies = new Pool(() => new Enemy(this));
    this.gems = new Pool(() => new Gem(this));
    this.gates = new Pool(() => new Gate(this));
    this.sparks = {
      enemy: this.createSparks(C.COLORS.enemy),
      gem: this.createSparks(C.COLORS.gem),
      gate: this.createSparks(C.COLORS.gate),
      player: this.createSparks(C.COLORS.player),
    };
    this.createHud();
    this.bindKeys();
    this.bindPad();
    this.layout();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.autoPause, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.autoPause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.game.events.off(Phaser.Core.Events.BLUR, this.autoPause, this);
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.autoPause, this);
      this.steering.destroy();
    });
  }

  update(_time: number, deltaMs: number): void {
    if (this.paused) return;
    // Clamp so a dropped frame or a backgrounded tab can't teleport anything.
    const dt = Math.min(deltaMs / 1000, 0.05);
    const { width, height } = this.view;

    if (this.state === 'playing') {
      this.elapsed += dt;
      audio.setIntensity(this.elapsed);
      this.steering.update(dt, this.player.x, this.player.y, width, height, C.PLAYER_SIZE / 2);
      this.player.update(dt, this.steering.targetX, this.steering.targetY, this.steering.followTime, width, height);
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.spawnWave();
        this.waveTimer += this.waveInterval();
      }
    }

    const worldDt = this.state === 'playing' ? dt : dt * AFTERLIFE_TIME_SCALE;
    this.updateGates(worldDt);
    this.updateEnemies(worldDt);
    this.updateGems(worldDt);
    this.backdrop.follow(this.player.x, this.player.y);
    this.updateScore();
  }

  // ─── Spawning ────────────────────────────────────────────────────────────────

  private waveInterval(): number {
    const rampStart = (C.MAX_WAVE_SIZE - 1) * C.WAVE_GROWTH_TIME;
    const overtime = Math.max(0, this.elapsed - rampStart);
    return Math.max(C.MIN_WAVE_INTERVAL, C.WAVE_INTERVAL - overtime * C.WAVE_RAMP_RATE);
  }

  private spawnWave(): void {
    const { width, height } = this.view;
    const corners: [number, number][] = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const safe = corners.filter(
      ([cx, cy]) => Phaser.Math.Distance.Between(cx * width, cy * height, this.player.x, this.player.y) > C.CORNER_SAFE_DISTANCE,
    );
    const [cx, cy] = Phaser.Utils.Array.GetRandom(safe.length > 0 ? safe : corners);

    const size = Math.min(C.MAX_WAVE_SIZE, 1 + Math.floor(this.elapsed / C.WAVE_GROWTH_TIME));
    for (let i = 0; i < size && this.enemies.live.length < C.MAX_ENEMIES; i++) {
      const ox = C.CORNER_INSET + Math.random() * C.CORNER_SPREAD;
      const oy = C.CORNER_INSET + Math.random() * C.CORNER_SPREAD;
      this.enemies.obtain().spawn(cx ? width - ox : ox, cy ? height - oy : oy);
    }

    if (this.gates.live.length < C.MAX_GATES) this.spawnGate();
  }

  private spawnGate(): void {
    const { width, height } = this.view;
    const margin = C.GATE_HALF_LENGTH + C.MINE_RADIUS;
    for (let attempt = 0; attempt < 15; attempt++) {
      const x = Phaser.Math.FloatBetween(margin, width - margin);
      const y = Phaser.Math.FloatBetween(margin, height - margin);
      if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) >= C.GATE_SAFE_SPAWN_DISTANCE) {
        this.gates.obtain().spawn(x, y);
        return;
      }
    }
  }

  // ─── Simulation ──────────────────────────────────────────────────────────────

  private updateGates(dt: number): void {
    const { width, height } = this.view;
    const p = this.player;
    const live = this.gates.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const gate = live[i];
      gate.step(dt, width, height);
      if (this.state !== 'playing') continue;
      const hit = gate.test(p.prevX, p.prevY, p.x, p.y);
      if (hit === 'mine') this.die('KILLED BY MINE');
      else if (hit === 'clear') this.clearGate(i);
    }
  }

  private updateEnemies(dt: number): void {
    const live = this.enemies.live;
    const p = this.player;

    // Soft separation so the horde spreads into a swarm instead of stacking into one sprite.
    const sep = C.ENEMY_SEPARATION;
    for (const e of live) {
      e.sepX = 0;
      e.sepY = 0;
    }
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= sep * sep || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (sep - d) / sep / d;
        a.sepX += dx * push;
        a.sepY += dy * push;
        b.sepX -= dx * push;
        b.sepY -= dy * push;
      }
    }

    const speed = this.difficulty.enemySpeed;
    const reach = C.ENEMY_HIT_RADIUS + C.PLAYER_HIT_RADIUS;
    for (const e of live) {
      e.age += dt;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += ((dx / d) * speed + e.sepX * C.ENEMY_SEPARATION_FORCE) * dt;
      e.y += ((dy / d) * speed + e.sepY * C.ENEMY_SEPARATION_FORCE) * dt;
      e.render(dx, dy);
      if (this.state === 'playing' && e.armed && d < reach) this.die('KILLED BY ALIEN');
    }
  }

  private updateGems(dt: number): void {
    const live = this.gems.live;
    const p = this.player;
    const damping = Math.exp(-4 * dt);
    for (let i = live.length - 1; i >= 0; i--) {
      const gem = live[i];
      gem.age += dt;
      if (gem.expired) {
        this.gems.release(i);
        continue;
      }
      gem.vx *= damping;
      gem.vy *= damping;
      gem.x += gem.vx * dt;
      gem.y += gem.vy * dt;

      if (this.state === 'playing') {
        const dx = p.x - gem.x;
        const dy = p.y - gem.y;
        const d = Math.hypot(dx, dy);
        if (d < C.GEM_COLLECT_RADIUS) {
          this.collectGem(gem);
          this.gems.release(i);
          continue;
        }
        if (d < C.GEM_ATTRACT_RADIUS) {
          const step = Math.min(d, C.GEM_ATTRACT_SPEED * dt);
          gem.x += (dx / d) * step;
          gem.y += (dy / d) * step;
        }
      }
      gem.render();
    }
  }

  // ─── Events ──────────────────────────────────────────────────────────────────

  private clearGate(index: number): void {
    const gate = this.gates.live[index];
    const p = this.player;
    this.sparks.gate.explode(24, gate.x, gate.y);
    this.shockwave(p.x, p.y, C.BLAST_RADIUS, C.COLORS.gate);

    let killed = 0;
    const enemies = this.enemies.live;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y) >= C.BLAST_RADIUS) continue;
      this.sparks.enemy.explode(10, e.x, e.y);
      this.gems.obtain().spawn(e.x, e.y);
      this.enemies.release(i);
      killed++;
    }

    const points = killed * C.POINTS_PER_ENEMY + C.POINTS_PER_GATE;
    this.score += points;
    this.popup(gate.x, gate.y, `+${formatNumber(points * this.multiplier * this.difficulty.level)}`);
    this.cameras.main.shake(140, 0.003 + Math.min(killed, 20) * 0.0004);
    audio.gateBlast(killed);
    this.gates.release(index);
  }

  private collectGem(gem: Gem): void {
    this.multiplier++;
    this.sparks.gem.explode(6, gem.x, gem.y);
    this.multiplierText.setText(`×${this.multiplier}`);
    this.tweens.killTweensOf(this.multiplierText);
    this.multiplierText.setScale(1.35);
    this.tweens.add({ targets: this.multiplierText, scale: 1, duration: 180, ease: 'Quad.easeOut' });

    // Gems collected in quick succession play a rising arpeggio, capped so a big haul isn't a wall of noise.
    const now = this.time.now;
    this.coinChain = now - this.lastGemAt < 600 ? this.coinChain + 1 : 0;
    this.lastGemAt = now;
    if (now - this.lastCoinSoundAt > 45) {
      this.lastCoinSoundAt = now;
      audio.gem(this.coinChain);
    }
  }

  private die(reason: string): void {
    if (this.state !== 'playing') return;
    this.state = 'dying';
    const { x, y } = this.player;
    this.player.sprite.setVisible(false);
    this.sparks.player.explode(70, x, y);
    this.shockwave(x, y, 140, C.COLORS.player);
    this.cameras.main.shake(450, 0.012);
    audio.death();
    audio.setMusic('over');
    this.pauseButton.setVisible(false);

    const total = this.total;
    const record = total > settings.highScore;
    if (record) {
      settings.highScore = total;
      saveSettings();
    }
    this.time.delayedCall(1000, () => {
      this.state = 'over';
      if (record) audio.highScore();
      else audio.gameOver();
      this.showGameOver(reason, total, record);
    });
  }

  // ─── Effects ─────────────────────────────────────────────────────────────────

  private createSparks(tint: number): Phaser.GameObjects.Particles.ParticleEmitter {
    return this.add
      .particles(0, 0, 'spark', {
        emitting: false,
        lifespan: { min: 300, max: 750 },
        speed: { min: 60, max: 340 },
        scale: { start: 0.75, end: 0 },
        alpha: { start: 1, end: 0 },
        tint,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(4);
  }

  private shockwave(x: number, y: number, radius: number, tint: number): void {
    const ring = this.add.image(x, y, 'ring').setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setDepth(4).setScale(0);
    this.tweens.add({
      targets: ring,
      scale: radius / C.RING_RADIUS / TEX_SCALE,
      alpha: { from: 1, to: 0 },
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private popup(x: number, y: number, label: string): void {
    const text = addText(this, x, y - 20, label, { size: 26, color: '#ffe066' }).setDepth(6);
    this.tweens.add({ targets: text, y: y - 70, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => text.destroy() });
  }

  // ─── HUD & overlays ──────────────────────────────────────────────────────────

  private createHud(): void {
    // Numbers use the body font: Orbitron's heavy slashed zero reads as a filled box.
    this.scoreText = addText(this, 0, 0, '0', { size: 40 })
      .setOrigin(0, 0)
      .setShadow(0, 0, '#55eeff', 12, false, true)
      .setDepth(50);
    this.multiplierText = addText(this, 0, 0, '×1', { size: 28, color: '#9dff4a' }).setOrigin(0, 0).setDepth(50);
    this.highScoreText = addText(this, 0, 0, `HIGH ${formatNumber(settings.highScore)}`, { size: 20 }).setOrigin(1, 0).setDepth(50);
    this.difficultyText = addText(this, 0, 0, this.difficulty.name.toUpperCase(), { size: 16, color: this.difficulty.color })
      .setOrigin(1, 0)
      .setDepth(50);
    this.pauseButton = addButton(this, 'II', () => this.setPaused(true), 56, 52).setDepth(50);
  }

  private updateScore(): void {
    const total = this.total;
    if (total === this.shownTotal) return;
    this.shownTotal = total;
    this.scoreText.setText(formatNumber(total));
  }

  private layout(): void {
    this.view = applyView(this);
    const { width, height } = this.view;
    this.backdrop.layout(width, height);
    this.scoreText.setPosition(HUD_MARGIN, 18);
    this.multiplierText.setPosition(HUD_MARGIN, 68);
    this.pauseButton.setPosition(width - HUD_MARGIN - 28, 18 + 26);
    this.highScoreText.setPosition(width - HUD_MARGIN - 72, 20);
    this.difficultyText.setPosition(width - HUD_MARGIN - 72, 48);
    this.overlay?.setPosition(width / 2, height / 2);
  }

  private showOverlay(children: Phaser.GameObjects.GameObject[]): void {
    this.overlay?.destroy();
    const { width, height } = this.view;
    this.overlay = this.add.container(width / 2, height / 2, children).setDepth(100).setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: this.overlay, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  }

  private hideOverlay(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
  }

  private panel(width: number, height: number): Phaser.GameObjects.Rectangle {
    return this.add.rectangle(0, 0, width, height, 0x05060c, 0.85).setStrokeStyle(2, C.COLORS.player, 0.8);
  }

  private showGameOver(reason: string, total: number, record: boolean): void {
    const children: Phaser.GameObjects.GameObject[] = [
      this.panel(580, 430),
      addText(this, 0, -150, reason, { size: 24, color: '#ff7ad9' }),
      addText(this, 0, -70, formatNumber(total), { size: 72 }).setShadow(0, 0, '#55eeff', 16, false, true),
      addText(this, 0, -15, 'POINTS', { size: 20, color: '#8a93b8' }),
      addButton(this, 'RESTART', () => this.restart()).setPosition(-140, 120),
      addButton(this, 'MENU', () => this.scene.start('menu')).setPosition(140, 120),
      addText(this, 0, 180, 'R / A restart    Esc / B menu', { size: 14, color: '#5d6480' }),
    ];
    if (record) {
      const banner = addText(this, 0, 45, 'NEW HIGH SCORE!', { font: 'title', size: 28, color: '#ffe066' });
      this.tweens.add({ targets: banner, scale: 1.1, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      children.push(banner);
      this.highScoreText.setText(`HIGH ${formatNumber(total)}`);
    } else {
      children.push(addText(this, 0, 45, `High score  ${formatNumber(settings.highScore)}`, { size: 20, color: '#cfd8ff' }));
    }
    this.showOverlay(children);
  }

  private setPaused(paused: boolean): void {
    if (this.state !== 'playing' || this.paused === paused) return;
    this.paused = paused;
    audio.setMusic(paused ? 'paused' : 'game');
    this.time.paused = paused;
    this.pauseButton.setVisible(!paused);
    if (!paused) {
      this.hideOverlay();
      return;
    }
    this.showOverlay([
      this.panel(520, 300),
      addText(this, 0, -80, 'PAUSED', { font: 'title', size: 48 }),
      addButton(this, 'RESUME', () => this.setPaused(false)).setPosition(-140, 50),
      addButton(this, 'MENU', () => this.scene.start('menu')).setPosition(140, 50),
      addText(this, 0, 115, 'P / Esc / A resume    B menu', { size: 14, color: '#5d6480' }),
    ]);
  }

  private autoPause(): void {
    this.setPaused(true);
  }

  private restart(): void {
    audio.start();
    this.scene.restart();
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    keyboard.on('keydown-P', () => this.setPaused(!this.paused));
    keyboard.on('keydown-ESC', () => {
      if (this.state === 'playing') this.setPaused(!this.paused);
      else if (this.state === 'over') this.scene.start('menu');
    });
    const restartIfOver = () => {
      if (this.state === 'over') this.restart();
    };
    keyboard.on('keydown-R', restartIfOver);
    keyboard.on('keydown-ENTER', restartIfOver);
    keyboard.on('keydown-SPACE', restartIfOver);
    keyboard.on('keydown-M', () => toggleMute());
  }

  private bindPad(): void {
    onPadButtons(this, {
      [PAD.MENU]: () => this.setPaused(!this.paused),
      [PAD.A]: () => {
        if (this.paused) this.setPaused(false);
        else if (this.state === 'over') this.restart();
      },
      [PAD.B]: () => {
        if (this.paused || this.state === 'over') this.scene.start('menu');
      },
      [PAD.VIEW]: () => toggleMute(),
    });
  }
}
