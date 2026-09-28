import { cssVar } from "@voxel51/voodo";

/**
 * Shared dark background used behind multimodal visualization canvases.
 *
 * A `var(--…)` reference: hand it to canvas 2D, three.js, MapLibre or plotly
 * through `resolveCssColor` from `@fiftyone/utilities` at draw time.
 */
export const VISUALIZATION_PANEL_BACKGROUND_COLOR = cssVar.color.bg.popover;

/**
 * Muted text color for visualization loading and empty states.
 */
export const VISUALIZATION_STATUS_TEXT_COLOR = cssVar.color.text.secondary;

/**
 * Foreground color for compact visualization HUD text.
 */
export const VISUALIZATION_HUD_TEXT_COLOR = cssVar.color.text.primary;

/**
 * Background for compact visualization HUD overlays.
 */
export const VISUALIZATION_HUD_BACKGROUND_COLOR = cssVar.color.tooltip.bg;

/**
 * Subtle border color for compact visualization HUD overlays.
 */
export const VISUALIZATION_HUD_BORDER_COLOR = cssVar.color.border.subtle;
