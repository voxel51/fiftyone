/**
 * Recoil state atoms for camera frustum visualization.
 */

import { getBrowserStorageEffectForKey } from "@fiftyone/state/src/recoil/customEffects";
import { atom } from "recoil";

/**
 * Global toggle for frustum visibility.
 * When false, no frustums are rendered.
 * Persisted in browser storage.
 */
export const frustumsVisibleAtom = atom<boolean>({
  key: "fo3d-frustumsVisible",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("fo3d-frustumsVisible", {
      valueClass: "boolean",
    }),
  ],
});

/**
 * Color for frustum wireframes (gray).
 */
export const FRUSTUM_COLOR = "#888888";

/**
 * Highlight color when frustum is hovered (bright white).
 */
export const FRUSTUM_HOVER_COLOR = "#ffffff";

/**
 * Opacity for the semi-transparent far plane (almost transparent).
 */
export const FRUSTUM_PLANE_OPACITY = 0.1;

/**
 * Opacity when hovering (more visible for interaction feedback).
 */
export const FRUSTUM_HOVER_OPACITY = 0.3;

/**
 * Line width for frustum wireframe edges.
 */
export const FRUSTUM_LINE_WIDTH = 2;

/**
 * Line width for axes at camera origin.
 */
export const FRUSTUM_AXES_LINE_WIDTH = 2;

/**
 * Size of the axes helper at each camera origin.
 * Shows X (red), Y (green), Z (blue) axes.
 */
export const FRUSTUM_AXES_SIZE = 0.5;
