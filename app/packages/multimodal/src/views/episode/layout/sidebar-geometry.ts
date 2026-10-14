/** Default width shared by the loading scaffold and live playback shell. */
export const SIDEBAR_SIZE_PX = 360;

/** Keeps settings controls readable while leaving room for the media panes. */
export const SIDEBAR_MIN_WIDTH_PX = 280;
/** Maximum width of the resizable settings sidebar. */
export const SIDEBAR_MAX_WIDTH_PX = 560;

/** Clamps a requested sidebar width to the live shell's pixel bounds. */
export function clampSidebarWidth(px: number): number {
  return Math.min(
    SIDEBAR_MAX_WIDTH_PX,
    Math.max(SIDEBAR_MIN_WIDTH_PX, Math.round(px)),
  );
}
