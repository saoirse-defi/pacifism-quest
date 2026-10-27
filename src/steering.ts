import Phaser from 'phaser';
import {
  MOUSE_FOLLOW_TIME,
  PAD_DEADZONE,
  PAD_FOLLOW_TIME,
  PAD_SPEED,
  TOUCH_FOLLOW_TIME,
  TOUCH_SENSITIVITY,
} from './config';
import { firstPad } from './gamepad';

type Mode = 'mouse' | 'touch' | 'pad';

const FOLLOW_TIME: Record<Mode, number> = {
  mouse: MOUSE_FOLLOW_TIME,
  touch: TOUCH_FOLLOW_TIME,
  pad: PAD_FOLLOW_TIME,
};

/**
 * Turns player input into a target point for the ship. Whichever input was used last wins.
 * Mouse: the target is the cursor, as in the original game.
 * Touch: relative drag from anywhere on screen, so your finger never covers the ship.
 * Controller: the left stick pushes the target, so the ship flies at a speed set by how far it's tilted.
 */
export class Steering {
  targetX: number;
  targetY: number;
  private mode: Mode = 'mouse';
  private touchId: number | null = null;
  private lastTouchX = 0;
  private lastTouchY = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
  ) {
    this.targetX = x;
    this.targetY = y;
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
  }

  get followTime(): number {
    return FOLLOW_TIME[this.mode];
  }

  /** Reads the controller stick, then keeps the target inside the playfield. */
  update(dt: number, shipX: number, shipY: number, width: number, height: number, margin: number): void {
    this.readStick(dt, shipX, shipY);
    this.targetX = Phaser.Math.Clamp(this.targetX, margin, width - margin);
    this.targetY = Phaser.Math.Clamp(this.targetY, margin, height - margin);
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
  }

  private readStick(dt: number, shipX: number, shipY: number): void {
    const pad = firstPad(this.scene);
    if (!pad) return;
    const { x, y } = pad.leftStick;
    const tilt = Math.hypot(x, y);
    if (tilt < PAD_DEADZONE) return;
    if (this.mode !== 'pad') {
      // Start from the ship, not from wherever the mouse last was.
      this.mode = 'pad';
      this.targetX = shipX;
      this.targetY = shipY;
    }
    // Rescale so speed ramps smoothly from zero at the edge of the deadzone.
    const speed = (Math.min(1, (tilt - PAD_DEADZONE) / (1 - PAD_DEADZONE)) * PAD_SPEED) / tilt;
    this.targetX += x * speed * dt;
    this.targetY += y * speed * dt;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!pointer.wasTouch) {
      this.aimAt(pointer);
      return;
    }
    this.mode = 'touch';
    if (this.touchId === null) {
      this.touchId = pointer.id;
      this.lastTouchX = pointer.x;
      this.lastTouchY = pointer.y;
    }
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (!pointer.wasTouch) {
      this.aimAt(pointer);
      return;
    }
    if (pointer.id !== this.touchId) return;
    const scale = TOUCH_SENSITIVITY / this.scene.cameras.main.zoom;
    this.targetX += (pointer.x - this.lastTouchX) * scale;
    this.targetY += (pointer.y - this.lastTouchY) * scale;
    this.lastTouchX = pointer.x;
    this.lastTouchY = pointer.y;
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.touchId) this.touchId = null;
  }

  private aimAt(pointer: Phaser.Input.Pointer): void {
    this.mode = 'mouse';
    const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.targetX = world.x;
    this.targetY = world.y;
  }
}
