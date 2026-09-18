/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The rows convert frame support to seconds through the modal sample's frame
 * rate ACCESSOR, whose target-rate fallback is what keeps an image dynamic
 * group's temporal-detection rows on the timeline (it has no `frameRate` field).
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  frameRate: 30,
  visible: new Set<string>(["events"]),
  temporalSample: {} as Record<string, unknown>,
}));

vi.mock("../state/accessors", () => ({
  useModalSampleFrameRate: () => state.frameRate,
  useVisibleLabelSchemas: () => state.visible,
}));

vi.mock("../sync/useTemporalOverlaySync", () => ({
  useEngineTemporalSample: () => state.temporalSample,
}));

import { useTemporalDetectionTracks } from "./useTemporalDetectionTracks";

const color = () => "c";

const sample = { sample: { _id: "s" } } as never;

describe("useTemporalDetectionTracks", () => {
  beforeEach(() => {
    state.frameRate = 30;
    state.visible = new Set(["events"]);
    state.temporalSample = {
      events: {
        _cls: "TemporalDetections",
        detections: [
          {
            _cls: "TemporalDetection",
            _id: "a",
            label: "run",
            support: [16, 45],
          },
        ],
      },
    };
  });

  it("builds rows at the accessor's rate, so a group with no frameRate field still gets rows", () => {
    // the sample itself carries no `frameRate`; only the accessor knows the rate
    const { result } = renderHook(() =>
      useTemporalDetectionTracks(sample, color),
    );

    expect(result.current).toHaveLength(1);
    const event = result.current[0].events[0];
    expect(event.startSec).toBeCloseTo(0.5);
    expect(event.endSec).toBeCloseTo(1.5);
  });

  it("drops every row when the accessor has no usable rate", () => {
    state.frameRate = 0;
    const { result } = renderHook(() =>
      useTemporalDetectionTracks(sample, color),
    );

    expect(result.current).toEqual([]);
  });

  it("keeps only the fields the surface has visible", () => {
    const { result } = renderHook(() =>
      useTemporalDetectionTracks(sample, color, new Set<string>()),
    );

    expect(result.current).toEqual([]);
  });
});
