import { cssVar } from "@voxel51/voodo";
import type { CSSProperties } from "react";

/** Fixed card geometry, shared by the stylesheet and the resize math. */
export const CARD_WIDTH = 208;
export const CARD_HEIGHT = 166;
export const CARD_PREVIEW_HEIGHT = 106;
/** Cards keep one height; their width follows the media, within reason. */
export const CARD_MIN_WIDTH = 106;
export const CARD_MAX_WIDTH = 320;

/**
 * The card width that shows the whole media at the fixed preview height.
 * Unknown or degenerate ratios fall back to the default width, where the
 * preview letterboxes instead.
 */
export function cardWidth(aspectRatio: number | null | undefined) {
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0)
    return CARD_WIDTH;
  return Math.round(
    Math.min(
      CARD_MAX_WIDTH,
      Math.max(CARD_MIN_WIDTH, CARD_PREVIEW_HEIGHT * aspectRatio),
    ),
  );
}
export const STRIP_GAP = 8;
export const STRIP_PADDING_TOP = 14;
export const STRIP_PADDING_BOTTOM = 8;
/** One row of cards plus the strip's padding. */
export const STRIP_ROW_HEIGHT = CARD_HEIGHT + STRIP_GAP;
export const STRIP_MIN_HEIGHT =
  CARD_HEIGHT + STRIP_PADDING_TOP + STRIP_PADDING_BOTTOM;
/** Fraction of the grid pane the strip may grow to before scrolling. */
export const STRIP_MAX_FRACTION = 0.4;

/**
 * VOODO tokens exposed as local custom properties so the stylesheet can bind
 * to them. Portaled surfaces (popovers, modals) do not inherit from the tray
 * root, so each portaled root applies this same style object.
 */
export const trayTheme = {
  "--tray-bg": cssVar.color.bg.card["1"],
  "--tray-strip-bg": cssVar.color.bg.background,
  "--tray-card-bg": cssVar.color.bg.card["2"],
  "--tray-raised": cssVar.color.bg.raised,
  "--tray-popover": cssVar.color.bg.popover,
  "--tray-overlay": cssVar.color.overlay.heavy,
  "--tray-border": cssVar.color.border.default,
  "--tray-border-strong": cssVar.color.border.strong,
  "--tray-border-subtle": cssVar.color.border.subtle,
  "--tray-accent": cssVar.color.brand.primary,
  "--tray-accent-soft": cssVar.color.bg.selected,
  "--tray-accent-text": cssVar.color.text.accent,
  "--tray-text": cssVar.color.text.primary,
  "--tray-text-secondary": cssVar.color.text.secondary,
  "--tray-text-muted": cssVar.color.text.muted,
  "--tray-info": cssVar.color.semantic.info,
  "--tray-warning": cssVar.color.semantic.warning,
  "--tray-destructive": cssVar.color.semantic.destructive,
  "--tray-success": cssVar.color.semantic.success,
  "--tray-focus": cssVar.color.focus.ring,
  "--tray-font": cssVar.fontFamily.sans,
  "--tray-font-xs": cssVar.text.xs,
  "--tray-font-sm": cssVar.text.sm,
  "--tray-space-xs": cssVar.spacing.xs,
  "--tray-space-sm": cssVar.spacing.sm,
  "--tray-space-md": cssVar.spacing.md,
  "--tray-duration": cssVar.transition.duration.normal,
  "--tray-duration-fast": cssVar.transition.duration.fast,
  "--tray-easing": cssVar.transition.easing.out,
  "--tray-card-w": `${CARD_WIDTH}px`,
  "--tray-card-w-min": `${CARD_MIN_WIDTH}px`,
  "--tray-card-h": `${CARD_HEIGHT}px`,
  "--tray-preview-h": `${CARD_PREVIEW_HEIGHT}px`,
  "--tray-strip-gap": `${STRIP_GAP}px`,
  "--tray-strip-pad-top": `${STRIP_PADDING_TOP}px`,
  "--tray-strip-pad-bottom": `${STRIP_PADDING_BOTTOM}px`,
} as CSSProperties;
