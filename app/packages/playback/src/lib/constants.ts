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
 * Height of a top-level track row (px), and `TimelineTrack`'s default. Also
 * the size `TimelineWithTracks` hands the virtualizer for rows it hasn't
 * measured yet, so it doubles as the estimate that sizes the drawer before the
 * first batch of rows mounts. Sub-rows render shorter (their decoration sets
 * `height`), which only ever makes the estimate an overestimate — the drawer
 * settles onto the measured total as soon as the rows commit.
 */
export const TIMELINE_TRACK_ROW_HEIGHT = 28;
/**
 * Extra pixels of rows the virtualizer keeps mounted above and below the
 * visible tracks region. Wide enough that a flick-scroll lands on rendered
 * rows rather than blank space, small enough that a 1000-track timeline still
 * only mounts a couple of dozen rows.
 */
export const TIMELINE_TRACK_OVERSCAN_PX = 240;

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
