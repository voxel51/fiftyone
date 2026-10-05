/**
 * The hook composes the track, identity, and temporal-detection ops over the
 * mocked engine hooks; op semantics live in the `tracks/*.test.ts` files.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  det,
  harness,
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

describe("track index gate", () => {
  it("drops a whole-track op when the track index failed", async () => {
    mockEngine.trackIndexReady.mockResolvedValue(false);
    harness.frameData = { 1: { A: det("d1", "A") } };

    await render().current.deleteTrack("instance-A");

    expect(mockEngine.trackIndexReady).toHaveBeenCalledWith(SAMPLE);
    expect(mockActions.deleteLabel).not.toHaveBeenCalled();
    expect(mockBus.dispatch).not.toHaveBeenCalled();
  });

  it("runs a whole-track op over the full track once a loading index lands", async () => {
    let settle: (ready: boolean) => void = () => undefined;
    mockEngine.trackIndexReady.mockReturnValue(
      new Promise<boolean>((resolve) => (settle = resolve)),
    );
    // only the held frame is known while the index loads
    harness.frameData = { 1: { A: det("d1", "A") } };

    const pending = render().current.deleteTrack("instance-A");
    await Promise.resolve();
    expect(mockActions.deleteLabel).not.toHaveBeenCalled();

    harness.frameData = {
      1: { A: det("d1", "A") },
      4: { A: det("d4", "A") },
    };
    settle(true);
    await pending;

    expect(
      mockActions.deleteLabel.mock.calls.map(([ref]) => ref.frame),
    ).toEqual([1, 4]);
  });

  it("does not gate markKeyframe, a single-frame op", () => {
    mockEngine.trackIndexReady.mockResolvedValue(false);
    harness.frameData = { 2: { A: det("d2", "A") } };

    render().current.markKeyframe(2, ["instance-A"]);

    expect(mockEngine.trackIndexReady).not.toHaveBeenCalled();
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "A", frame: 2 },
      { keyframe: true },
    );
  });
});
