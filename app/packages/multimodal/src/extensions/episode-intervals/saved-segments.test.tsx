import { cleanup, render } from "@testing-library/react";
import type { SampleRendererProps } from "@fiftyone/plugins";
import { afterEach, describe, expect, it, vi } from "vitest";
import { savedSegmentIntervalSource } from "./saved-segments";
import type { EpisodeIntervalContribution } from "./types";
import type { SelectionMember } from "@fiftyone/state/src/selection/types";

const scope = vi.hoisted(() => ({
  active: true,
  loading: true,
  members: [] as SelectionMember[],
  range: null as { startNs: bigint; endNs: bigint } | null,
}));
vi.mock("@fiftyone/state/src/selection/segment-hooks", () => ({
  useScopedSegments: () => scope,
}));
vi.mock("./use-episode-time-range", () => ({
  useEpisodeTimeRange: () => scope.range,
}));
afterEach(cleanup);

describe("saved segment interval source", () => {
  it("waits for exact ranges and epoch, then pins and opens at the earliest range", () => {
    const Source = savedSegmentIntervalSource.Component;
    const ctx = {
      sample: { sample: { _id: "sample" } },
    } as SampleRendererProps["ctx"];
    const report = vi.fn<(value: EpisodeIntervalContribution) => null>(
      () => null,
    );
    const view = render(<Source ctx={ctx}>{report}</Source>);
    expect(report.mock.lastCall?.[0]).toMatchObject({
      initialSeekPending: true,
      pinnedRowKeys: [],
    });
    scope.loading = false;
    scope.members = [20n, 10n].map((start) => ({
      episodeId: "sample",
      kind: "segment",
      range: {
        timebase: "timestamp-ns",
        start: String(1700000000000000000n + start),
        end: String(1700000000000000000n + start + 5n),
        streams: [],
        provenance: [],
      },
    }));
    view.rerender(<Source ctx={ctx}>{report}</Source>);
    expect(report.mock.lastCall?.[0].intervals).toEqual([]);
    scope.range = {
      startNs: 1700000000000000000n,
      endNs: 1700000000000000100n,
    };
    view.rerender(<Source ctx={ctx}>{report}</Source>);
    expect(report.mock.lastCall?.[0]).toMatchObject({
      initialSeekPending: false,
      initialSeekTimeNs: 1700000000000000010n,
      pinnedRowKeys: ["[]"],
      intervals: [
        { eventName: "Saved segment", startNs: 20, endNs: 25 },
        { startNs: 10, endNs: 15 },
      ],
    });
    scope.active = false;
    scope.members = [];
    view.rerender(<Source ctx={ctx}>{report}</Source>);
    expect(report.mock.lastCall?.[0]).toMatchObject({
      intervals: [],
      initialSeekPending: false,
      initialSeekTimeNs: undefined,
      pinnedRowKeys: undefined,
    });
  });
});
