import Phaser from 'phaser';

/** Button indices in the browser's standard gamepad mapping, named for an Xbox controller. */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  VIEW: 8,
  MENU: 9,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

/** Runs a handler when a controller button is pressed, for as long as the scene is running. */
export function onPadButtons(scene: Phaser.Scene, handlers: Partial<Record<number, () => void>>): void {
  const gamepad = scene.input.gamepad;
  if (!gamepad) return;
  const listener = (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => handlers[button.index]?.();
  gamepad.on(Phaser.Input.Gamepad.Events.BUTTON_DOWN, listener);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => gamepad.off(Phaser.Input.Gamepad.Events.BUTTON_DOWN, listener));
}

/** The first connected controller, if any. Browsers only report one after a button has been pressed. */
export function firstPad(scene: Phaser.Scene): Phaser.Input.Gamepad.Gamepad | undefined {
  return scene.input.gamepad?.getAll()[0];
}
