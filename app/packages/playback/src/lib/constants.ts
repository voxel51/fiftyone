export const DEFAULT_FRAME_NUMBER = 1;
export const DEFAULT_LOOP = false;
export const DEFAULT_SPEED = 1;
export const DEFAULT_TARGET_FRAME_RATE = 30;
export const DEFAULT_USE_TIME_INDICATOR = false;
export const GLOBAL_TIMELINE_ID = "fo-timeline-global";
export const MIN_LOAD_RANGE_SIZE = 350;
export const ATOM_FAMILY_CONFIGS_LRU_CACHE_SIZE = 100;
export const SEEK_BAR_DEBOUNCE = 10;

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
