import type { EpisodeIntervalSourceProps } from "@fiftyone/multimodal/extensions/episode-intervals";
import { registerEpisodeIntervalSource } from "@fiftyone/multimodal/extensions/episode-intervals";
import {
  publishEpisodeTimeRange,
  resetEpisodeTimeRangesForTests,
} from "@fiftyone/multimodal/runtime";
import { registerGridOverlay } from "@fiftyone/multimodal/extensions/timeline";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TileLanes } from "../TileLanes";
import SelectionTileLanes from "./SelectionTileLanes";

vi.mock("@fiftyone/state", () => ({
  useCurrentDataset: () => ({ datasetId: "dataset" }),
}));
vi.mock(
  "../../../../../multimodal/src/grid-overlay/temporal-tag-interval-source",
  () => ({
    temporalTagIntervalSource: {
      id: "test:temporal-tags",
      label: "Temporal tags",
      order: 200,
      Component: ({ children }: EpisodeIntervalSourceProps) =>
        children({ intervals: [] }),
    },
  }),
);
vi.mock(
  "../../../../../multimodal/src/extensions/episode-intervals/saved-segments",
  () => ({
    savedSegmentIntervalSource: {
      id: "test:saved-segments",
      label: "Saved segments",
      order: 100,
      Component: ({ children }: EpisodeIntervalSourceProps) =>
        children({ intervals: [] }),
    },
  }),
);

const node = { id: "episode", sample: { _id: "episode" } };
const ctx = {
  dataset: { datasetId: "dataset" },
  sample: node,
  surface: "grid",
} as const;
const NS = 1_000_000_000;
const dispose: Array<() => void> = [];

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 200,
    height: 200,
    top: 0,
    bottom: 200,
    left: 0,
    right: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  dispose.push(
    registerEpisodeIntervalSource({
      id: "test:segments",
      label: "Segments",
      order: 210,
      Component: ({ children }) =>
        children({
          intervals: [
            {
              sourceId: "test:segments",
              eventName: "testing",
              color: "orange",
              startNs: 10 * NS,
              endNs: 30 * NS,
            },
          ],
        }),
    }),
  );
});

afterEach(() => {
  cleanup();
  dispose.splice(0).forEach((release) => release());
  resetEpisodeTimeRangesForTests();
  vi.restoreAllMocks();
});

describe("SelectionTileLanes", () => {
  it.each(["video", "video with an image thumbnail", "multimodal"])(
    "draws the same recording-relative marks and registered lanes as the %s grid",
    (mediaType) => {
      if (mediaType === "multimodal") {
        publishEpisodeTimeRange("episode", {
          startNs: 100n * BigInt(NS),
          endNs: 200n * BigInt(NS),
        });
      }
      dispose.push(
        registerGridOverlay(({ ctx: overlayCtx }) => (
          <div data-testid="registered-lane">
            {overlayCtx.dataset.datasetId}:{overlayCtx.sample.sample._id}
          </div>
        )),
      );
      const previewNode =
        mediaType === "video with an image thumbnail"
          ? {
              ...node,
              sample: {
                ...node.sample,
                _media_type: "video",
                metadata: { duration: 100 },
              },
            }
          : node;
      render(
        <>
          <div data-grid-tile="">
            <TileLanes ctx={ctx} />
          </div>
          <div data-grid-tile="">
            <SelectionTileLanes
              node={previewNode}
              videoDuration={mediaType === "video" ? 100 : undefined}
            />
          </div>
        </>,
      );

      const marks = screen.getAllByTestId("episode-grid-overlay-mark");
      expect(marks).toHaveLength(2);
      expect(
        marks.map((mark) => [
          mark.style.left,
          mark.style.width,
          mark.style.background,
        ]),
      ).toEqual([
        ["10%", "20%", "orange"],
        ["10%", "20%", "orange"],
      ]);
      expect(
        screen
          .getAllByTestId("registered-lane")
          .map((lane) => lane.textContent),
      ).toEqual(["dataset:episode", "dataset:episode"]);
    },
  );
});
