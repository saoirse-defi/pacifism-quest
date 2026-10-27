import Phaser from 'phaser';
import { DESIGN_SHORT_SIDE } from './config';

export interface View {
  zoom: number;
  width: number;
  height: number;
}

/**
 * Fits the main camera to the screen. The canvas is rendered at device-pixel resolution,
 * and small screens are zoomed out so the playfield is never smaller than DESIGN_SHORT_SIDE.
 * Phones get the same amount of room to manoeuvre as desktops, just drawn smaller.
 */
export function applyView(scene: Phaser.Scene): View {
  const { width: pixelWidth, height: pixelHeight, zoom: scaleZoom } = scene.scale;
  const pixelRatio = 1 / scaleZoom;
  const cssShortSide = Math.min(pixelWidth, pixelHeight) / pixelRatio;
  const zoom = pixelRatio * Math.min(1, cssShortSide / DESIGN_SHORT_SIDE);
  const width = pixelWidth / zoom;
  const height = pixelHeight / zoom;

  const camera = scene.cameras.main;
  camera.setSize(pixelWidth, pixelHeight);
  camera.setZoom(zoom);
  camera.centerOn(width / 2, height / 2);

  return { zoom, width, height };
}
