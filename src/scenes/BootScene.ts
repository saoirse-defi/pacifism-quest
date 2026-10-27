import Phaser from 'phaser';
import { BACKGROUNDS, backgroundKey, FONT_BODY, FONT_TITLE } from '../config';
import { createTextures } from '../textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    const { width, height, zoom } = this.scale;
    const label = this.add
      .text(width / 2, height / 2, 'LOADING', { fontFamily: 'monospace', fontSize: `${Math.round(18 / zoom)}px`, color: '#55eeff' })
      .setOrigin(0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => label.setText(`LOADING ${Math.round(progress * 100)}%`));

    BACKGROUNDS.forEach((name, i) => this.load.image(backgroundKey(i), `assets/bg/${name}.jpg`));
  }

  create(): void {
    createTextures(this);
    // Canvas text can't use a web font until it has loaded, so wait (but not forever).
    const fonts = Promise.all([document.fonts.load(`900 32px ${FONT_TITLE}`), document.fonts.load(`32px ${FONT_BODY}`)]);
    const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
    Promise.race([fonts, timeout])
      .catch(() => undefined)
      .then(() => this.scene.start('menu'));
  }
}
