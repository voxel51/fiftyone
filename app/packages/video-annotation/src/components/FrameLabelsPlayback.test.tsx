/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  PlaybackProvider,
  useIsPlaying,
  useIsPlayPending,
  usePlayback,
} from "@fiftyone/playback";
import type { ModalSample } from "@fiftyone/state";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getVideoLabelsWindow } from "../../../core/src/client/videoLabelsClient";

vi.mock("../../../core/src/client/videoLabelsClient", () => ({
  getVideoLabelsWindow: vi.fn(),
}));
vi.mock("../state/accessors", () => ({
  useActiveDetectionField: () => "frames.detections",
  useDatasetName: () => "dataset",
  useDynamicGroupValue: () => null,
  useFrameLabelFields: () => ({}),
  useFramePrimitivePaths: () => [],
  useGroupSlice: () => null,
  useModalSampleFrameRate: () => 5,
  useModalSampleId: () => "sample",
  useView: () => [],
}));
vi.mock("../state/exploreFrameLabelFields", () => ({
  useExploreFrameLabelFields: () => ({ "frames.detections": "Detections" }),
}));
vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => null,
  usePublishFrameLabelsStream: () => undefined,
}));

import { RegisterFrameLabels } from "./FrameLabels";

/** A transport readout driven by the real playback engine. */
function Transport() {
  const { play } = usePlayback();
  const playing = useIsPlaying();
  const pending = useIsPlayPending();
  return (
    <button onClick={play}>
      {playing ? "playing" : pending ? "pending" : "paused"}
    </button>
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe("frame labels and pending playback", () => {
  it.each(["empty frames", "label documents"])(
    "starts an early Play when the window lands with %s",
    async (kind) => {
      let finish!: (
        value: Awaited<ReturnType<typeof getVideoLabelsWindow>>,
      ) => void;
      vi.mocked(getVideoLabelsWindow).mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      render(
        <PlaybackProvider duration={3} mode={{ kind: "sequence", fps: 5 }}>
          <RegisterFrameLabels
            sample={{} as ModalSample}
            mode="explore"
            initialTime={0}
          />
          <Transport />
        </PlaybackProvider>,
      );
      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(button.textContent).toBe("pending");
      expect(getVideoLabelsWindow).toHaveBeenCalledTimes(1);
      await act(async () => {
        finish({
          frames:
            kind === "empty frames"
              ? {}
              : { 1: { detections: { detections: [] } } },
          range: [1, 15],
        });
      });
      expect(button.textContent).toBe("playing");
      expect(getVideoLabelsWindow).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps a failed window from immediately retrying while Play is pending", async () => {
    let reject!: (reason: Error) => void;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(getVideoLabelsWindow)
      .mockImplementationOnce(
        () =>
          new Promise((_, fail) => {
            reject = fail;
          }),
      )
      .mockImplementation(() => new Promise(() => undefined));
    render(
      <PlaybackProvider duration={3} mode={{ kind: "sequence", fps: 5 }}>
        <RegisterFrameLabels
          sample={{} as ModalSample}
          mode="explore"
          initialTime={0}
        />
        <Transport />
      </PlaybackProvider>,
    );
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button.textContent).toBe("pending");
    await act(async () => reject(new Error("window failed")));
    expect(button.textContent).toBe("pending");
    expect(getVideoLabelsWindow).toHaveBeenCalledTimes(1);
  });
});
