/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * 2D rectangle with position and size.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 2D point coordinates.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Drawing style for shapes.
 */
export interface DrawStyle {
  strokeStyle?: string;
  fillStyle?: string;
  lineWidth?: number;
  opacity?: number;
}

/**
 * Text rendering options.
 */
export interface TextOptions {
  font?: string;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  padding?: number;
  maxWidth?: number;
}

/**
 * Status of an overlay in the rendering pipeline.
 */
export type OverlayStatus =
  | "pending"
  | "decoded"
  | "painting"
  | "painted"
  | "error";
