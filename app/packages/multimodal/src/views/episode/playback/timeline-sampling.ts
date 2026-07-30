import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceReadProfile,
} from "../../../ir";

/** Lowest supported episode timeline sampling rate. */
export const MIN_TIMELINE_SAMPLING_RATE_HZ = 1;
/** Highest supported episode timeline sampling rate. */
export const MAX_TIMELINE_SAMPLING_RATE_HZ = 120;

/** Named sampling-rate choices exposed by the playback settings UI. */
const TIMELINE_SAMPLING_PRESET = Object.freeze({
  ECONOMY: {
    id: "economy",
    label: "Economy",
    rateHz: 24,
  },
  BALANCED: {
    id: "balanced",
    label: "Balanced",
    rateHz: 30,
  },
  SMOOTH: {
    id: "smooth",
    label: "Smooth",
    rateHz: 60,
  },
} as const);

/** Stable identifier for a named timeline sampling preset. */
export type TimelineSamplingPresetId =
  (typeof TIMELINE_SAMPLING_PRESET)[keyof typeof TIMELINE_SAMPLING_PRESET]["id"];

/** Named timeline sampling presets in display order. */
export const TIMELINE_SAMPLING_PRESETS = Object.freeze([
  TIMELINE_SAMPLING_PRESET.ECONOMY,
  TIMELINE_SAMPLING_PRESET.BALANCED,
  TIMELINE_SAMPLING_PRESET.SMOOTH,
] as const);

/** Source-profile default used until a dataset/source stores an explicit rate. */
export function defaultTimelineSamplingRateHz(
  readProfile: ByteSourceReadProfile | undefined,
): number {
  return readProfile === BYTE_SOURCE_READ_PROFILE.REMOTE
    ? TIMELINE_SAMPLING_PRESET.ECONOMY.rateHz
    : TIMELINE_SAMPLING_PRESET.BALANCED.rateHz;
}

/** Returns a preset only when the rate exactly names one. */
export function timelineSamplingPresetForRate(
  rateHz: number,
): (typeof TIMELINE_SAMPLING_PRESETS)[number] | undefined {
  return TIMELINE_SAMPLING_PRESETS.find((preset) => preset.rateHz === rateHz);
}

/** Sanitizes persisted or untyped sampling-rate input. */
export function sanitizeTimelineSamplingRateHz(
  value: unknown,
): number | undefined {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= MIN_TIMELINE_SAMPLING_RATE_HZ &&
    value <= MAX_TIMELINE_SAMPLING_RATE_HZ
    ? value
    : undefined;
}

/** Rounds and clamps an interactive custom rate into the supported range. */
export function normalizeTimelineSamplingRateHz(value: number): number {
  if (!Number.isFinite(value)) {
    return TIMELINE_SAMPLING_PRESET.BALANCED.rateHz;
  }
  return Math.min(
    MAX_TIMELINE_SAMPLING_RATE_HZ,
    Math.max(MIN_TIMELINE_SAMPLING_RATE_HZ, Math.round(value)),
  );
}
