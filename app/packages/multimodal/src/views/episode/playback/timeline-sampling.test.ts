import { describe, expect, it } from "vitest";

import { BYTE_SOURCE_READ_PROFILE } from "../../../ir";
import {
  defaultTimelineSamplingRateHz,
  normalizeTimelineSamplingRateHz,
  TIMELINE_SAMPLING_PRESETS,
  timelineSamplingPresetForRate,
  sanitizeTimelineSamplingRateHz,
} from "./timeline-sampling";

describe("timeline sampling", () => {
  it("defaults remote sources to Economy and local sources to Balanced", () => {
    expect(defaultTimelineSamplingRateHz(BYTE_SOURCE_READ_PROFILE.REMOTE)).toBe(
      TIMELINE_SAMPLING_PRESETS[0].rateHz,
    );
    expect(defaultTimelineSamplingRateHz(BYTE_SOURCE_READ_PROFILE.LOCAL)).toBe(
      TIMELINE_SAMPLING_PRESETS[1].rateHz,
    );
    expect(defaultTimelineSamplingRateHz(undefined)).toBe(
      TIMELINE_SAMPLING_PRESETS[1].rateHz,
    );
  });

  it("recognizes presets and leaves other supported rates custom", () => {
    expect(timelineSamplingPresetForRate(24)?.id).toBe("economy");
    expect(timelineSamplingPresetForRate(30)?.id).toBe("balanced");
    expect(timelineSamplingPresetForRate(60)?.id).toBe("smooth");
    expect(timelineSamplingPresetForRate(48)).toBeUndefined();
  });

  it("validates persisted integers and clamps interactive custom rates", () => {
    expect(sanitizeTimelineSamplingRateHz(1)).toBe(1);
    expect(sanitizeTimelineSamplingRateHz(120)).toBe(120);
    expect(sanitizeTimelineSamplingRateHz(0)).toBeUndefined();
    expect(sanitizeTimelineSamplingRateHz(30.5)).toBeUndefined();
    expect(normalizeTimelineSamplingRateHz(-10)).toBe(1);
    expect(normalizeTimelineSamplingRateHz(48.6)).toBe(49);
    expect(normalizeTimelineSamplingRateHz(500)).toBe(120);
  });
});
