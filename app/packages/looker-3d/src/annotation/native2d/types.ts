/**
 * Types for stored 2D labels rendered on Annotate-mode camera slices.
 *
 * These are the image-native `Detection`/`Polyline` labels that live on each
 * image slice sample (already in normalized image coordinates), as opposed to
 * the 3D working-doc labels that are projected through the camera frustum.
 */

export interface Native2dDetection {
  _id: string;
  _cls: "Detection";
  /** Sample field path the label came from (used for color-by-field). */
  path: string;
  label?: string;
  /** Normalized [top-left-x, top-left-y, width, height]. */
  boundingBox: [number, number, number, number];
}

export interface Native2dPolyline {
  _id: string;
  _cls: "Polyline";
  /** Sample field path the label came from (used for color-by-field). */
  path: string;
  label?: string;
  /** Normalized segments, each a list of [x, y] points. */
  points: [number, number][][];
  closed?: boolean;
  filled?: boolean;
}

export type Native2dLabel = Native2dDetection | Native2dPolyline;
