export const DEFAULT_PLAYBACK_RATE = 1.5;
export const BUFFERING_PAUSE_TIMEOUT = 250;
export const BUFFERS_REFRESH_TIMEOUT_YIELD = 500;
// todo: cache by bytes and not by number of samples
export const MAX_FRAME_SAMPLES_CACHE_SIZE = 500;
export const LOOK_AHEAD_MULTIPLIER = 4;
export const ANIMATION_CANCELED_ID = -1;

// hover dwell required before starting a thumbnail's frame-stream fetch, so scrolling
// past tiles or tiles mounting under a stationary cursor never floods the server
export const HOVER_FETCH_INTENT_MS = 200;

// first fetch off the poster stays small for a quick start, but large enough to give the first
// full-batch refill time to land before the seed window drains (avoids an early re-buffer)
export const INITIAL_LOOK_AHEAD_FRAMES = 50;

// per-request fetch floor; matches pymongo's default cursor batch
export const STREAM_BATCH_FRAMES = 100;

export const IMAVID_PLAYBACK_RATE_LOCAL_STORAGE_KEY = "fo-imavid-playback-rate";
