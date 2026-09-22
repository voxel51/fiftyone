/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Tests for the create-mode teardown this bridge owns: deleting a track, and the
 * generic right-click / Esc mode quit, must drop the user back to Select for
 * WHICHEVER create mode is active — not just detection. A mode left nominally
 * active after its overlay is gone looks armed (highlighted tool) but draws
 * nothing, because its scene creation handler went with the overlay.
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  annotationHandlers: new Map<string, (payload: unknown) => void>(),
  lighterHandlers: new Map<string, (payload: unknown) => void>(),
  detection: {
    detectionModeActive: false,
    deactivateDetectionMode: vi.fn(),
    create: vi.fn(),
  },
  segmentation: {
    segmentationModeActive: false,
    deactivateSegmentationMode: vi.fn(),
    finalizePointSelection: vi.fn(),
    create: vi.fn(),
  },
  polyline: {
    polylineModeActive: false,
    deactivatePolylineMode: vi.fn(),
  },
}));

vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEventHandler: (
    event: string,
    cb: (payload: unknown) => void,
  ) => {
    hoisted.annotationHandlers.set(event, cb);
  },
  useAnnotationEngine: () => ({
    getLabel: () => undefined,
    getLabelType: () => "Polylines",
    interaction: { getActive: () => [] },
  }),
  useActiveSampleId: () => "sample-1",
  FRAMES_PREFIX: "frames.",
}));

vi.mock("@fiftyone/lighter", () => ({
  useLighterEventHandler:
    () => (event: string, cb: (payload: unknown) => void) => {
      hoisted.lighterHandlers.set(event, cb);
    },
  UNDEFINED_LIGHTER_SCENE_ID: "undefined-scene",
}));

vi.mock(
  "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useDetectionMode",
  () => ({ useDetectionMode: () => hoisted.detection }),
);
vi.mock(
  "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode",
  () => ({ useSegmentationMode: () => hoisted.segmentation }),
);
vi.mock(
  "../../../core/src/components/Modal/Sidebar/Annotate/Edit/usePolylineMode",
  () => ({
    usePolylineMode: () => hoisted.polyline,
    usePolylineModeInstaller: () => undefined,
  }),
);
vi.mock(
  "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext",
  () => ({ useAnnotationContext: () => ({ selected: null, clear: vi.fn() }) }),
);
vi.mock(
  "../../../core/src/components/Modal/Sidebar/Annotate/Edit/useExit",
  () => ({ default: () => vi.fn() }),
);
vi.mock("../hooks/useVideoSurfaceActions", () => ({
  useVideoSurfaceActions: () => ({}),
}));
vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => ({ labelsField: "polylines", totalFrames: 40 }),
}));
vi.mock("../state/accessors", () => ({
  useCurrentEditingOverlay: () => null,
}));
vi.mock("./establishKeyRelay", () => ({
  takeEstablishKey: () => undefined,
  stashEstablishKey: vi.fn(),
}));
vi.mock("../tracks/autoExtend", () => ({ autoExtendTargetFrames: () => [] }));

import { useSyncLighterAnnotation } from "./useSyncLighterAnnotation";

const mount = () => renderHook(() => useSyncLighterAnnotation(null));
const fireTrackDeleted = () =>
  hoisted.annotationHandlers.get("annotation:trackDeleted")?.({
    trackId: "instance-1",
  });

describe("track deleted — drop back to Select", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.detection.detectionModeActive = false;
    hoisted.segmentation.segmentationModeActive = false;
    hoisted.polyline.polylineModeActive = false;
  });

  it("leaves polyline mode when a polyline track is deleted", () => {
    // Regression: Backspace on a polyline track left polyline mode active with
    // its creation handler gone — the tool looked armed, the cursor reverted to a
    // pointer, and clicking the canvas drew nothing.
    hoisted.polyline.polylineModeActive = true;
    mount();

    fireTrackDeleted();

    expect(hoisted.polyline.deactivatePolylineMode).toHaveBeenCalledTimes(1);
  });

  it("still tears detection mode down, as it always did", () => {
    hoisted.detection.detectionModeActive = true;
    mount();

    fireTrackDeleted();

    expect(hoisted.detection.deactivateDetectionMode).toHaveBeenCalledTimes(1);
  });

  it("leaves segmentation mode when a masked track is deleted", () => {
    hoisted.segmentation.segmentationModeActive = true;
    mount();

    fireTrackDeleted();

    expect(
      hoisted.segmentation.deactivateSegmentationMode,
    ).toHaveBeenCalledTimes(1);
  });

  it("does not deactivate a mode that wasn't active", () => {
    mount();

    fireTrackDeleted();

    expect(hoisted.polyline.deactivatePolylineMode).not.toHaveBeenCalled();
    expect(
      hoisted.segmentation.deactivateSegmentationMode,
    ).not.toHaveBeenCalled();
  });
});

describe("mode quit — right-click / Esc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.detection.detectionModeActive = false;
    hoisted.segmentation.segmentationModeActive = false;
    hoisted.polyline.polylineModeActive = false;
  });

  it("quits polyline mode when it is the active one", () => {
    hoisted.polyline.polylineModeActive = true;
    mount();

    hoisted.lighterHandlers.get("lighter:active-mode-quit-requested")?.({});

    expect(hoisted.polyline.deactivatePolylineMode).toHaveBeenCalledTimes(1);
  });

  it("prefers detection mode when several are somehow active", () => {
    hoisted.detection.detectionModeActive = true;
    hoisted.polyline.polylineModeActive = true;
    mount();

    hoisted.lighterHandlers.get("lighter:active-mode-quit-requested")?.({});

    expect(hoisted.detection.deactivateDetectionMode).toHaveBeenCalledTimes(1);
    expect(hoisted.polyline.deactivatePolylineMode).not.toHaveBeenCalled();
  });
});
