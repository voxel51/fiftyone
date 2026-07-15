// @vitest-environment jsdom
/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Tests for the label-type selection gates that scope the toolbar's Mark
 * Keyframe (detections only) and Split (detections + polylines) actions. The
 * gate reads the FIELD's type via `engine.getLabelType`, so a fresh engine's
 * type resolver is stubbed per path; interaction state is real so the hook
 * re-renders on `setActive`.
 */
import { act, renderHook } from "@testing-library/react";
import { LabelType } from "@fiftyone/utilities";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnnotationEngine } from "../../../annotation/src/engine/core/engine";
import type { LabelRef } from "../../../annotation/src/engine/identity/ref";

let currentEngine: AnnotationEngine;

vi.mock("@fiftyone/annotation", async () => {
  const real = await vi.importActual<typeof import("@fiftyone/annotation")>(
    "@fiftyone/annotation",
  );
  return {
    ...real,
    useAnnotationEngine: () => currentEngine,
  };
});

import {
  useSelectionIsInstanceTrack,
  useSelectionIsKeyframeable,
} from "./useVideoInteraction";

const TYPE_BY_PATH: Record<string, LabelType> = {
  "frames.detections": LabelType.Detections,
  "frames.polylines": LabelType.Polylines,
  events: LabelType.TemporalDetections,
  classifications: LabelType.Classification,
};

const setActive = (refs: readonly LabelRef[]) =>
  act(() => currentEngine.interaction.setActive(refs));

beforeEach(() => {
  currentEngine = new AnnotationEngine();
  // Fresh engine has no schema — resolve label types from the fixture table.
  currentEngine.getLabelType = (path: string) =>
    TYPE_BY_PATH[path] ?? LabelType.Unknown;
});

describe("useSelectionIsKeyframeable (detections only)", () => {
  it("is false on an empty selection", () => {
    const { result } = renderHook(() => useSelectionIsKeyframeable());
    expect(result.current).toBe(false);
  });

  it("is true for a detection selection", () => {
    const { result } = renderHook(() => useSelectionIsKeyframeable());
    setActive([{ sample: "s1", path: "frames.detections", instanceId: "d1" }]);
    expect(result.current).toBe(true);
  });

  it("is false for a polyline selection", () => {
    const { result } = renderHook(() => useSelectionIsKeyframeable());
    setActive([{ sample: "s1", path: "frames.polylines", instanceId: "p1" }]);
    expect(result.current).toBe(false);
  });

  it("is false for a temporal-detection selection", () => {
    const { result } = renderHook(() => useSelectionIsKeyframeable());
    setActive([{ sample: "s1", path: "events", instanceId: "td1" }]);
    expect(result.current).toBe(false);
  });

  it("is false for a mixed detection + polyline selection", () => {
    const { result } = renderHook(() => useSelectionIsKeyframeable());
    setActive([
      { sample: "s1", path: "frames.detections", instanceId: "d1" },
      { sample: "s1", path: "frames.polylines", instanceId: "p1" },
    ]);
    expect(result.current).toBe(false);
  });
});

describe("useSelectionIsInstanceTrack (detections + polylines)", () => {
  it("is false on an empty selection", () => {
    const { result } = renderHook(() => useSelectionIsInstanceTrack());
    expect(result.current).toBe(false);
  });

  it("is true for a detection selection", () => {
    const { result } = renderHook(() => useSelectionIsInstanceTrack());
    setActive([{ sample: "s1", path: "frames.detections", instanceId: "d1" }]);
    expect(result.current).toBe(true);
  });

  it("is true for a polyline selection", () => {
    const { result } = renderHook(() => useSelectionIsInstanceTrack());
    setActive([{ sample: "s1", path: "frames.polylines", instanceId: "p1" }]);
    expect(result.current).toBe(true);
  });

  it("is false for a temporal-detection selection", () => {
    const { result } = renderHook(() => useSelectionIsInstanceTrack());
    setActive([{ sample: "s1", path: "events", instanceId: "td1" }]);
    expect(result.current).toBe(false);
  });

  it("is false when any selected track is a non-instance type", () => {
    const { result } = renderHook(() => useSelectionIsInstanceTrack());
    setActive([
      { sample: "s1", path: "frames.detections", instanceId: "d1" },
      { sample: "s1", path: "events", instanceId: "td1" },
    ]);
    expect(result.current).toBe(false);
  });
});
