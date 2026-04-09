import type { LoopMode, PlayState } from "./types";

export const DEFAULT_FRAME_NUMBER = 1;
export const DEFAULT_LOOP: LoopMode = "none";
export const DEFAULT_SPEED = 1;
export const DEFAULT_TICK_RATE = 30;
export const DEFAULT_TICK_RATE_DURATION = 60;
export const DEFAULT_USE_TIME_INDICATOR = false;
export const GLOBAL_TIMELINE_ID = "fo-timeline-global";
export const MIN_LOAD_RANGE_SIZE = 350;
export const SEEK_BAR_DEBOUNCE = 10;

export const PLAY_STATE_PLAYING: PlayState = "playing";
export const PLAY_STATE_PAUSED: PlayState = "paused";
export const PLAY_STATE_BUFFERING: PlayState = "buffering";
export const PLAY_STATE_FOLLOWING: PlayState = "following";
