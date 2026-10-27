import Phaser from 'phaser';
import { BACKGROUNDS, backgroundKey } from './config';
import { saveSettings, settings } from './settings';

/** How far the background drifts against the player's position. */
const PARALLAX = 0.03;

/** A space background image that covers the playfield and drifts slightly with the player. */
export class Backdrop {
  private readonly image: Phaser.GameObjects.Image;
  private width = 0;
  private height = 0;

  constructor(scene: Phaser.Scene) {
    this.image = scene.add.image(0, 0, backgroundKey(settings.background)).setDepth(-10).setAlpha(0.8);
  }

  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const cover = Math.max(width / this.image.width, height / this.image.height);
    this.image.setScale(cover * (1 + PARALLAX)).setPosition(width / 2, height / 2);
  }

  follow(x: number, y: number): void {
    const cx = this.width / 2;
    const cy = this.height / 2;
    this.image.setPosition(cx - (x - cx) * PARALLAX, cy - (y - cy) * PARALLAX);
  }

  next(): void {
    settings.background = (settings.background + 1) % BACKGROUNDS.length;
    saveSettings();
    this.image.setTexture(backgroundKey(settings.background));
    this.layout(this.width, this.height);
  }
}
