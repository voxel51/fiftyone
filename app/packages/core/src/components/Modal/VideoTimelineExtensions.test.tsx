// @vitest-environment jsdom
import {
  publishEmbeddingSelection,
  registerTimelineExtension,
  type TimelineComposition,
  type TimelineExtensionComponentProps,
} from "@fiftyone/multimodal/extensions/timeline";
import type * as fos from "@fiftyone/state";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ durationSec: 7, seek: vi.fn() }));

vi.mock("@fiftyone/state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/state")>()),
  useCurrentDataset: () => ({ name: "traffic", datasetId: "dataset-1" }),
  useModalSampleSchema: () => ({}),
  useSelectedMediaFieldModal: () => "filepath",
}));
vi.mock("@fiftyone/playback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/playback")>()),
  useDuration: () => env.durationSec,
  usePlayback: () => ({ seek: env.seek }),
}));

import { VideoTimelineExtensions } from "./VideoTimelineExtensions";

const SAMPLE = {
  sample: { _id: "sample-1", filepath: "/videos/clip.mp4" },
} as unknown as fos.ModalSample;

const ROW = {
  id: "embedding-window::video",
  label: "video",
  color: "#000",
  events: [],
};

let unregister: (() => void) | undefined;
afterEach(() => {
  cleanup();
  publishEmbeddingSelection(null);
  env.seek.mockReset();
  unregister?.();
  unregister = undefined;
});

describe("VideoTimelineExtensions", () => {
  it("opens a matched video at its first matched window", () => {
    publishEmbeddingSelection({
      byEpisode: {
        "sample-1": [
          { stream: "video", startUs: 4_000_000, endUs: 5_000_000 },
          { stream: "video", startUs: 2_500_000, endUs: 3_000_000 },
        ],
      },
    });

    render(
      <VideoTimelineExtensions sample={SAMPLE}>
        {() => null}
      </VideoTimelineExtensions>,
    );

    expect(env.seek).toHaveBeenCalledTimes(1);
    expect(env.seek).toHaveBeenCalledWith(2.5);
  });

  it("runs the timeline extensions for this video, from time 0 to its end, and hands their rows to its timeline", () => {
    const seen = vi.fn();
    unregister = registerTimelineExtension({
      id: "test:probe",
      order: 1,
      Component: ({
        children,
        ...context
      }: TimelineExtensionComponentProps) => {
        seen(context);
        return (
          <>
            {children({
              sections: [
                { id: "test:rows", label: "Rows", order: 1, tracks: [ROW] },
              ],
            })}
          </>
        );
      },
    });
    const composed = vi.fn<(composition: TimelineComposition) => null>(
      () => null,
    );

    render(
      <VideoTimelineExtensions sample={SAMPLE}>
        {composed}
      </VideoTimelineExtensions>,
    );

    const context = seen.mock.lastCall?.[0];
    expect(context.ctx.sample.sample._id).toBe("sample-1");
    expect(context.ctx.media.path).toBe("/videos/clip.mp4");
    expect(context.timeRange).toEqual({ startNs: 0n, endNs: 7_000_000_000n });
    expect(composed.mock.lastCall?.[0].tracks).toEqual([ROW]);
  });
});
