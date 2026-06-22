export const DEFAULT_PLAYBACK_RATE = 1.5;
export const BUFFERING_PAUSE_TIMEOUT = 250;
export const BUFFERS_REFRESH_TIMEOUT_YIELD = 500;
// todo: cache by bytes and not by number of samples
export const MAX_FRAME_SAMPLES_CACHE_SIZE = 500;
export const LOOK_AHEAD_MULTIPLIER = 4;
export const ANIMATION_CANCELED_ID = -1;

// sustained-hover delay before a thumbnail's heavy stream fetch starts, so scrolling
// past tiles doesn't flood the server
export const HOVER_FETCH_INTENT_MS = 200;

// first fetch off the seeded poster pulls only this many frames for a fast start
export const INITIAL_LOOK_AHEAD_FRAMES = 20;

// steady-state fetch batch floor (matches pymongo's default cursor batch) so low
// frame rates don't issue tiny per-request fetches
export const STREAM_BATCH_FRAMES = 100;

export const IMAVID_PLAYBACK_RATE_LOCAL_STORAGE_KEY = "fo-imavid-playback-rate";
