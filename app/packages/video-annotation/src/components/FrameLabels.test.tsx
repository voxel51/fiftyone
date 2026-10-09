/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * `RegisterFrameLabels` re-mounts its stream registration whenever the set of
 * fetched frame fields changes, and a fresh registration seeks to its opening
 * position. A sidebar toggle is the same video at the same playhead, so that
 * re-mount must resume at the playhead; a new sample must still
 * open at `initialTime`.
 */

import type { ModalSample } from "@fiftyone/state";
import { render } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  currentTime: 0,
  sampleId: "sample-a",
  fields: { "frames.detections": "Detections" } as Record<string, string>,
};

/** Each registration's opening seek, in mount order. */
const seeks: Array<number | null | undefined> = [];

vi.mock("../state/accessors", () => ({
  useActiveDetectionField: () => "frames.detections",
  useDatasetName: () => "dataset",
  useDynamicGroupValue: () => null,
  useFrameLabelFields: () => ({}),
  useFramePrimitivePaths: () => [],
  useGroupSlice: () => null,
  useModalSampleFrameRate: () => 30,
  useModalSampleId: () => state.sampleId,
  useView: () => [],
}));

vi.mock("../state/exploreFrameLabelFields", () => ({
  useExploreFrameLabelFields: () => state.fields,
}));

vi.mock("@fiftyone/playback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/playback")>()),
  getPlayhead: () => state.currentTime,
  useActivateStream: () => undefined,
  useDuration: () => 10,
  usePlaybackStore: () => ({}),
  usePlaybackStream: () => undefined,
}));

vi.mock("../streams/VideoFrameLabelsStream", () => ({
  VideoFrameLabelsStream: class {
    setPrimaryField = vi.fn();
    dispose = vi.fn();
  },
}));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => null,
  usePublishFrameLabelsStream: () => undefined,
}));

vi.mock("../hooks/useWarmupThenSeek", () => ({
  useWarmupThenSeek: (
    stream: object | null,
    time?: number | null | (() => number),
  ) => {
    useEffect(() => {
      seeks.push(typeof time === "function" ? time() : time);
      // one opening seek per stream, as the real hook keys on the stream
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stream]);
  },
}));

import { RegisterFrameLabels } from "./FrameLabels";

const sample = {} as ModalSample;

const renderRegistrar = (initialTime?: number) =>
  render(
    <RegisterFrameLabels
      sample={sample}
      mode="explore"
      initialTime={initialTime}
    />,
  );

describe("RegisterFrameLabels opening seek", () => {
  beforeEach(() => {
    seeks.length = 0;
    state.currentTime = 0;
    state.sampleId = "sample-a";
    state.fields = { "frames.detections": "Detections" };
  });

  it("opens a new registration at initialTime", () => {
    renderRegistrar(3);

    expect(seeks).toEqual([3]);
  });

  it("resumes at the playhead when a field toggle re-keys it", () => {
    const { rerender } = renderRegistrar();
    state.currentTime = 57.5;

    state.fields = {
      "frames.detections": "Detections",
      "frames.segmentations": "Detections",
    };
    rerender(<RegisterFrameLabels sample={sample} mode="explore" />);

    state.fields = { "frames.detections": "Detections" };
    rerender(<RegisterFrameLabels sample={sample} mode="explore" />);

    expect(seeks).toEqual([undefined, 57.5, 57.5]);
  });

  it("opens a new sample at initialTime, not the previous sample's time", () => {
    const { rerender } = renderRegistrar(0);
    state.currentTime = 57.5;

    state.sampleId = "sample-b";
    rerender(
      <RegisterFrameLabels sample={sample} mode="explore" initialTime={0} />,
    );

    expect(seeks).toEqual([0, 0]);
  });

  it("does not seek again as the clock moves after resuming", () => {
    const { rerender } = renderRegistrar();
    state.currentTime = 20;
    state.fields = {
      "frames.detections": "Detections",
      "frames.segmentations": "Detections",
    };
    rerender(<RegisterFrameLabels sample={sample} mode="explore" />);

    state.currentTime = 25;
    rerender(<RegisterFrameLabels sample={sample} mode="explore" />);

    expect(seeks).toEqual([undefined, 20]);
  });
});
