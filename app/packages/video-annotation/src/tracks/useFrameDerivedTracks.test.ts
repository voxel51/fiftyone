/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  labelFields: {} as Record<string, string>,
  index: { indexByPath: {}, loaded: false },
}));

vi.mock("@fiftyone/annotation", () => ({
  useActiveSampleId: () => "sample-1",
  useAnnotationEngine: () => ({ loadedFrames: () => [], listLabels: () => [] }),
  useEngineSelector: (_engine: unknown, selector: () => unknown) => selector(),
}));

vi.mock("../hooks/useVideoLabelsIndex", () => ({
  useVideoLabelsIndex: () => h.index,
}));

vi.mock("../state/accessors", () => ({
  useFrameLabelFields: () => h.labelFields,
  useVisibleLabelSchemas: () => new Set(Object.keys(h.labelFields)),
}));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => ({ fps: 30 }),
}));

import { useFrameDerivedTracks } from "./useFrameDerivedTracks";

const render = () =>
  renderHook(() =>
    useFrameDerivedTracks(
      () => "#fff",
      () => [],
    ),
  ).result.current;

describe("useFrameDerivedTracks", () => {
  beforeEach(() => {
    h.labelFields = {};
    h.index = { indexByPath: {}, loaded: false };
  });

  it("resolves at once when there is no frame field to index", () => {
    // the index fetch never runs for an empty field set, so waiting on it
    // would hold the surface's cover forever
    expect(render().resolved).toBe(true);
  });

  it("waits for the index when there are frame fields", () => {
    h.labelFields = { "frames.detections": "Detections" };

    expect(render().resolved).toBe(false);

    h.index = { indexByPath: { "frames.detections": [] }, loaded: true };
    expect(render().resolved).toBe(true);
  });
});
