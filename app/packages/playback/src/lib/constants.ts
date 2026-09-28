export const DEFAULT_FRAME_NUMBER = 1;
export const DEFAULT_LOOP = false;
export const DEFAULT_SPEED = 1;
/**
 * Playback speed is a rate multiplier valid on `(0, MAX_SPEED]` — any positive
 * value up to the ceiling. The ceiling is a UX guardrail, not the real limit:
 * decode/buffer throughput is what actually caps sustained playback, and the
 * engine's buffering already stalls when it can't keep up. There is no policy
 * floor; `MIN_SPEED` is only the smallest value the 2-decimal display can show
 * without rounding to 0.
 */
export const MAX_SPEED = 8;
export const MIN_SPEED = 0.01;
export const DEFAULT_TARGET_FRAME_RATE = 30;
export const DEFAULT_USE_TIME_INDICATOR = false;
export const GLOBAL_TIMELINE_ID = "fo-timeline-global";
export const MIN_LOAD_RANGE_SIZE = 350;
export const ATOM_FAMILY_CONFIGS_LRU_CACHE_SIZE = 100;
export const SEEK_BAR_DEBOUNCE = 10;

// ---------------------------------------------------------------------------
// TimelineWithTracks layout
// ---------------------------------------------------------------------------

/**
 * Width of the label column shared between ruler and tracks (px). Doubles as
 * the *minimum* width when the user drags the column's right edge — the
 * ceiling is the widest label actually rendered (see `TimelineWithTracks`).
 */
export const TIMELINE_LABEL_WIDTH = 180;
/** Initial open size of the timeline drawer in px. Capped by content height. */
export const TIMELINE_DEFAULT_DRAWER_SIZE = 220;
/** Hard ceiling on the timeline drawer height in px (independent of content). */
export const TIMELINE_DRAWER_MAX_SIZE = 600;
/**
 * `TimelineTrack`'s default row height (px). A row can be any height — callers
 * override it per row, and video annotation's dynamic-attribute sub-rows are
 * shorter — so this is a default, not a layout contract.
 */
export const TIMELINE_TRACK_ROW_HEIGHT = 28;
/**
 * What `TimelineWithTracks` assumes a row costs *before anything is measured*:
 * it sizes the drawer for the first paint and decides how many rows to seed
 * the virtualizer with. Purely a first-frame guess — every row is measured
 * once mounted, and the drawer settles onto the real total on the next commit.
 *
 * It starts at the standard row height because that is what a typical row is,
 * not because rows must be that tall. A surface whose rows are mostly shorter
 * (many expanded sub-rows, say) should say so via
 * `TimelineWithTracksProps.estimatedRowHeight` rather than wear the drawer
 * opening too tall and snapping down a frame later.
 */
export const TIMELINE_TRACK_ESTIMATED_ROW_HEIGHT = TIMELINE_TRACK_ROW_HEIGHT;
/**
 * Extra pixels of rows the virtualizer keeps mounted above and below the
 * visible tracks region — the trade between blank space on a flick-scroll and
 * how many rows are mounted at rest.
 *
 * Kept deliberately small (~3 rows either side): a row still paints a marker
 * per event in view, so a wide overscan on an event-dense timeline buys smooth
 * flick-scrolling with real layout work. Raise it if scrolling shows blank
 * bands; lower it to 0 to mount strictly what's visible. Overridable per
 * surface via `TimelineWithTracksProps.overscanPx`.
 */
export const TIMELINE_TRACK_OVERSCAN_PX = 96;

export const PLAYHEAD_STATE_PLAYING = "playing";
export const PLAYHEAD_STATE_PAUSED = "paused";
export const PLAYHEAD_STATE_BUFFERING = "buffering";
export const PLAYHEAD_STATE_WAITING_TO_PLAY = "waitingToPlay";
export const PLAYHEAD_STATE_WAITING_TO_PAUSE = "waitingToPause";

export type PlayheadState =
  | typeof PLAYHEAD_STATE_PLAYING
  | typeof PLAYHEAD_STATE_PAUSED
  | typeof PLAYHEAD_STATE_BUFFERING
  | typeof PLAYHEAD_STATE_WAITING_TO_PLAY
  | typeof PLAYHEAD_STATE_WAITING_TO_PAUSE;
