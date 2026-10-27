import Phaser from 'phaser';
import { audio } from '../audio';
import { DIFFICULTIES, PLAYER_SIZE } from '../config';
import { Backdrop } from '../backdrop';
import { Player } from '../entities';
import { firstPad, onPadButtons, PAD } from '../gamepad';
import { closePanel, openBoardPanel, panelOpen } from '../panels';
import { saveSettings, settings } from '../settings';
import { Steering } from '../steering';
import { addButton, addText, formatNumber, isTouchDevice, toggleMute } from '../ui';
import { applyView, View } from '../view';

const BRIEFING = [
  'Energy weapons are down!',
  'Pass through the center of gates to manage the enemy horde.',
  'Beware of deadly mines at the edge of gates!',
].join('\n');

const PAD_HINTS = 'A start    X background    Y leaderboard    D-pad / LB RB difficulty    View sound';

export class MenuScene extends Phaser.Scene {
  private view!: View;
  private backdrop!: Backdrop;
  private player!: Player;
  private steering!: Steering;
  private title!: Phaser.GameObjects.Text;
  private briefing!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private difficultyLabel!: Phaser.GameObjects.Text;
  private difficultyNote!: Phaser.GameObjects.Text;
  private prevButton!: Phaser.GameObjects.Container;
  private nextButton!: Phaser.GameObjects.Container;
  private startButton!: Phaser.GameObjects.Container;
  private backgroundButton!: Phaser.GameObjects.Container;
  private leaderboardButton!: Phaser.GameObjects.Container;
  private highScoreText!: Phaser.GameObjects.Text;
  private soundText!: Phaser.GameObjects.Text;
  private keysText!: Phaser.GameObjects.Text;
  private hue = 0;

  constructor() {
    super('menu');
  }

  create(): void {
    document.body.classList.add('in-menu');
    audio.setMusic('menu');
    this.view = applyView(this);
    this.backdrop = new Backdrop(this);
    const touch = isTouchDevice();

    this.briefing = addText(this, 0, 0, BRIEFING, { size: 24 }).setLineSpacing(12);
    this.hint = addText(this, 0, 0, touch ? 'Drag anywhere to steer — try it here' : 'Move your mouse to steer — try it here', {
      size: 18,
      color: '#7fe9ff',
    });

    // The ship flies over the briefing but under the title, like the original.
    const { width, height } = this.view;
    this.player = new Player(this, width / 2, height / 2);
    this.steering = new Steering(this, width / 2, height / 2);
    this.title = addText(this, 0, 0, 'AGAINST ALL ODDS', { font: 'title', size: 72 }).setDepth(10);

    this.prevButton = addButton(this, '<', () => this.changeDifficulty(-1), 60, 52).setDepth(10);
    this.nextButton = addButton(this, '>', () => this.changeDifficulty(1), 60, 52).setDepth(10);
    this.difficultyLabel = addText(this, 0, 0, '', { font: 'title', size: 28 }).setDepth(10);
    this.difficultyNote = addText(this, 0, 0, '', { size: 18, color: '#cfd8ff' }).setDepth(10);
    this.refreshDifficulty();

    this.startButton = addButton(this, 'START', () => this.startGame()).setDepth(10);
    this.backgroundButton = addButton(this, 'BACKGROUND', () => this.changeBackground()).setDepth(10);
    this.leaderboardButton = addButton(this, 'LEADERBOARD', () => this.showLeaderboard(), 550).setDepth(10);
    this.highScoreText = addText(this, 0, 0, `HIGH SCORE  ${formatNumber(settings.highScore)}`, { size: 22 }).setDepth(10);
    this.keysText = addText(this, 0, 0, touch ? '' : 'S start    B background    L leaderboard    ← → difficulty    M sound', {
      size: 16,
      color: '#8a93b8',
    });
    this.soundText = addText(this, 0, 0, '', { size: 18, color: '#7fe9ff' }).setOrigin(1, 0).setDepth(10);
    this.soundText.setInteractive({ useHandCursor: true }).on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.toggleSound());
    this.refreshSound();

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.on('keydown-S', () => this.startGame());
      keyboard.on('keydown-ENTER', () => this.startGame());
      keyboard.on('keydown-SPACE', () => this.startGame());
      keyboard.on('keydown-B', () => this.changeBackground());
      keyboard.on('keydown-LEFT', () => this.changeDifficulty(-1));
      keyboard.on('keydown-RIGHT', () => this.changeDifficulty(1));
      keyboard.on('keydown-M', () => this.toggleSound());
      keyboard.on('keydown-L', () => this.showLeaderboard());
    }
    // While the leaderboard panel is open, B closes it and everything else is ignored.
    const unlessPanel = (action: () => void) => () => {
      if (!panelOpen()) action();
    };
    onPadButtons(this, {
      [PAD.A]: unlessPanel(() => this.startGame()),
      [PAD.MENU]: unlessPanel(() => this.startGame()),
      [PAD.X]: unlessPanel(() => this.changeBackground()),
      [PAD.Y]: unlessPanel(() => this.showLeaderboard()),
      [PAD.B]: () => closePanel(),
      [PAD.DPAD_LEFT]: unlessPanel(() => this.changeDifficulty(-1)),
      [PAD.LB]: unlessPanel(() => this.changeDifficulty(-1)),
      [PAD.DPAD_RIGHT]: unlessPanel(() => this.changeDifficulty(1)),
      [PAD.RB]: unlessPanel(() => this.changeDifficulty(1)),
      [PAD.VIEW]: unlessPanel(() => this.toggleSound()),
    });
    // Swap the key hints for controller hints once a controller shows up.
    const showPadHints = () => this.keysText.setText(PAD_HINTS);
    if (firstPad(this)) showPadHints();
    this.input.gamepad?.once(Phaser.Input.Gamepad.Events.CONNECTED, showPadHints);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.input.gamepad?.off(Phaser.Input.Gamepad.Events.CONNECTED, showPadHints),
    );

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.body.classList.remove('in-menu');
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.steering.destroy();
    });
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const { width, height } = this.view;
    this.steering.update(dt, this.player.x, this.player.y, width, height, PLAYER_SIZE / 2);
    this.player.update(dt, this.steering.targetX, this.steering.targetY, this.steering.followTime, width, height);
    this.backdrop.follow(this.player.x, this.player.y);

    this.hue = (this.hue + dt * 60) % 360;
    const color = `hsl(${Math.round(this.hue)}, 100%, 60%)`;
    this.title.setColor(color).setShadow(0, 0, color, 18, false, true);
  }

  private layout(): void {
    this.view = applyView(this);
    const { width: w, height: h } = this.view;
    const cx = w / 2;
    this.backdrop.layout(w, h);

    this.briefing.setWordWrapWidth(w * 0.9);
    // Stack everything as one column, centred vertically (tall phone screens leave gaps otherwise).
    const blockHeight = 560 + this.briefing.height;
    let y = Math.max(70, (h - blockHeight) / 2);

    this.title.setFontSize(Math.floor(Math.min(84, w / 14))).setPosition(cx, y);
    y += 80 + this.briefing.height / 2;
    this.briefing.setPosition(cx, y);
    y += this.briefing.height / 2 + 34;
    this.hint.setPosition(cx, y);

    y += 86;
    this.difficultyLabel.setPosition(cx, y);
    this.prevButton.setPosition(cx - 220, y);
    this.nextButton.setPosition(cx + 220, y);
    y += 44;
    this.difficultyNote.setPosition(cx, y);

    y += 86;
    this.startButton.setPosition(cx - 145, y);
    this.backgroundButton.setPosition(cx + 145, y);
    y += 70;
    this.leaderboardButton.setPosition(cx, y);
    y += 80;
    this.highScoreText.setPosition(cx, y);
    y += 40;
    this.keysText.setPosition(cx, y);
    this.soundText.setPosition(w - 24, 24);
  }

  private changeDifficulty(step: number): void {
    const count = DIFFICULTIES.length;
    settings.difficulty = (settings.difficulty + step + count) % count;
    saveSettings();
    this.refreshDifficulty();
    audio.select();
  }

  private changeBackground(): void {
    this.backdrop.next();
    audio.select();
  }

  private refreshDifficulty(): void {
    const difficulty = DIFFICULTIES[settings.difficulty];
    this.difficultyLabel.setText(difficulty.name.toUpperCase()).setColor(difficulty.color);
    this.difficultyNote.setText(`Enemy speed ${difficulty.level}   ·   Score ×${difficulty.level}`);
  }

  private toggleSound(): void {
    toggleMute();
    if (!settings.muted) audio.select();
    this.refreshSound();
  }

  private refreshSound(): void {
    this.soundText.setText(settings.muted ? 'SOUND OFF' : 'SOUND ON');
  }

  private showLeaderboard(): void {
    if (panelOpen()) return;
    audio.select();
    openBoardPanel(this, settings.difficulty);
  }

  private startGame(): void {
    audio.start();
    this.scene.start('game');
  }
}
