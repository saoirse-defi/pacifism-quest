import Phaser from 'phaser';
import { audio } from './audio';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';

// Render at device-pixel resolution (capped at 2x for performance) and let the scale
// manager's zoom shrink the canvas back to CSS size, so everything stays sharp on phones.
const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);
const ratio = pixelRatio();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.NONE,
    width: window.innerWidth * ratio,
    height: window.innerHeight * ratio,
    zoom: 1 / ratio,
  },
  input: { gamepad: true },
  // All sound is synthesised by our own engine (audio.ts), so Phaser's audio system is off.
  audio: { noAudio: true },
  scene: [BootScene, MenuScene, GameScene],
});

audio.init();

// Handy for poking at scenes from the dev-tools console during development.
if (import.meta.env.DEV) Object.assign(window, { game, audio });

window.addEventListener('resize', () => {
  const r = pixelRatio();
  game.scale.setZoom(1 / r);
  game.scale.resize(window.innerWidth * r, window.innerHeight * r);
});
