/**
 * The hook composes the track, identity, and temporal-detection ops over the
 * mocked engine hooks; op semantics live in the `tracks/*.test.ts` files.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mockActions,
  mockBus,
  mockEngine,
  resetHarness,
  SAMPLE,
  PATH,
} from "../tracks/opsTestHarness";
import { useVideoSurfaceActions } from "./useVideoSurfaceActions";

const mockStream = {
  fps: 10,
  totalFrames: 5,
  labelsField: "detections",
  labelsPath: PATH,
};

vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEngine: () => mockEngine,
  useSurfaceActions: () => mockActions,
  useActiveSampleId: () => SAMPLE,
  useAnnotationEventBus: () => mockBus,
}));

vi.mock("@fiftyone/playback", () => ({ frameAt: (time: number) => time }));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => mockStream,
}));

const render = () => renderHook(() => useVideoSurfaceActions()).result;

beforeEach(() => {
  resetHarness();
});

describe("temporal-detection ops", () => {
  it("createTemporalDetection mints a sample-level TD and returns its id", () => {
    const id = render().current.createTemporalDetection(
      "events",
      [3, 12],
      "speaking",
    );

    expect(id).toBe("new-td");
    expect(mockActions.createLabel).toHaveBeenCalledWith("events", {
      _cls: "TemporalDetection",
      support: [3, 12],
      tags: [],
      label: "speaking",
    });
    // the fresh TD becomes the selection, replacing any prior one
    expect(mockActions.setActive).toHaveBeenCalledWith([
      { sample: SAMPLE, path: "events", instanceId: "new-td" },
    ]);
  });

  it("editTemporalDetection updates by id with no frame", () => {
    render().current.editTemporalDetection("events", "t1", { support: [5, 9] });

    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: "events", instanceId: "t1" },
      { support: [5, 9] },
    );
  });

  it("deleteTemporalDetection deletes by id with no frame", () => {
    render().current.deleteTemporalDetection("events", "t1");

    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: "events",
      instanceId: "t1",
    });
  });
});
