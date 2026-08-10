/**
 * Shared limits for reconstructing and consuming one H.264 dependency chain.
 *
 * A runway contains the keyframe and the delta frames before the requested
 * target. Keeping this limit in the codec layer prevents readers and decoders
 * from silently disagreeing about which access units will actually be used.
 */
export const MAX_H264_DECODE_RUNWAY_FRAMES = 600;

/** Maximum access units submitted to WebCodecs before waiting for progress. */
export const MAX_H264_DECODE_IN_FLIGHT_FRAMES = 8;

/** Maximum time without a decoded output before a batch is considered stuck. */
export const H264_DECODE_STALL_TIMEOUT_MS = 3_000;
