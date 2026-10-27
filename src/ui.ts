import Phaser from 'phaser';
import { audio } from './audio';
import { COLORS, FONT_BODY, FONT_TITLE } from './config';
import { saveSettings, settings } from './settings';

/** Text is rasterised at device resolution so it stays sharp when the camera zooms in. */
const TEXT_RESOLUTION = Math.min(Math.ceil(window.devicePixelRatio || 1), 3);

export interface TextOptions {
  font?: 'title' | 'body';
  size: number;
  color?: string;
}

export function addText(scene: Phaser.Scene, x: number, y: number, text: string, options: TextOptions): Phaser.GameObjects.Text {
  const title = options.font === 'title';
  return scene.add
    .text(x, y, text, {
      fontFamily: title ? `${FONT_TITLE}, sans-serif` : `${FONT_BODY}, monospace`,
      fontStyle: title ? '900' : 'normal',
      fontSize: `${options.size}px`,
      color: options.color ?? '#ffffff',
      align: 'center',
    })
    .setOrigin(0.5)
    .setResolution(TEXT_RESOLUTION);
}

/** A neon outlined button. Fires on press rather than release so it feels instant on touch. */
export function addButton(
  scene: Phaser.Scene,
  label: string,
  onPress: () => void,
  width = 260,
  height = 58,
): Phaser.GameObjects.Container {
  const frame = scene.add.rectangle(0, 0, width, height, 0x000000, 0.5).setStrokeStyle(2, COLORS.player, 0.9);
  const text = addText(scene, 0, 0, label, { font: 'title', size: 22, color: '#bff8ff' });
  frame.setInteractive({ useHandCursor: true });
  frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => frame.setFillStyle(COLORS.player, 0.2));
  frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => frame.setFillStyle(0x000000, 0.5));
  frame.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onPress);
  return scene.add.container(0, 0, [frame, text]);
}

export const formatNumber = (value: number) => value.toLocaleString('en-US');

export const isTouchDevice = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

export function toggleMute(): void {
  settings.muted = !settings.muted;
  saveSettings();
  audio.setMuted(settings.muted);
}
