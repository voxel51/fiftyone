export const DEFAULT_PLAYBACK_RATE = 1.5;
export const BUFFERING_PAUSE_TIMEOUT = 250;
export const BUFFERS_REFRESH_TIMEOUT_YIELD = 500;
// todo: cache by bytes and not by number of samples
export const MAX_FRAME_SAMPLES_CACHE_SIZE = 500;
export const LOOK_AHEAD_MULTIPLIER = 4;
export const ANIMATION_CANCELED_ID = -1;

// A thumbnail must be hovered this long before its (heavy, uncancellable) per-group
// frame-stream fetch starts — so scrolling past tiles, or tiles mounting under a
// stationary cursor, never floods the server with stream queries.
export const HOVER_FETCH_INTENT_MS = 200;

// The first fetch off the seeded poster pulls only this many frames so playback /
// hover-preview starts in well under a second; the look-ahead buffer then grows to
// the full LOOK_AHEAD window on subsequent fetches.
export const INITIAL_LOOK_AHEAD_FRAMES = 20;

// Steady-state fetch batch floor: each look-ahead request pulls AT LEAST this many
// frames (matches pymongo's default cursor batch). Anything smaller is per-request
// overhead, not streaming — at low frame rates `frameRate * LOOK_AHEAD_MULTIPLIER`
// alone would issue tiny ~17-frame requests.
export const STREAM_BATCH_FRAMES = 100;

export const IMAVID_PLAYBACK_RATE_LOCAL_STORAGE_KEY = "fo-imavid-playback-rate";
