import type { SampleRendererProps } from "@fiftyone/plugins";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EpisodeIntervalContribution } from "../extensions/episode-intervals";

const state = {
  activeValues: [] as string[],
  fieldActive: false,
};

const useSampleRendererTemporalTags = vi.fn();

vi.mock("@fiftyone/state", () => ({
  useActiveTemporalTagFilterValues: () => state.activeValues,
  useTemporalTagsFieldActive: () => state.fieldActive,
  useTemporalTagColor: () => (value: string) => `color-${value}`,
}));

vi.mock("../temporal-tags", () => ({
  useSampleRendererTemporalTags: (ctx: unknown) =>
    useSampleRendererTemporalTags(ctx),
}));

const { temporalTagIntervalSource } =
  await import("./temporal-tag-interval-source");

const CTX = {
  dataset: { datasetId: "ds", name: "ds" },
  sample: { sample: { _id: "ep" } },
  media: {},
} as unknown as SampleRendererProps["ctx"];

const NS = 1_000_000_000;
const tag = (name: string, startSec: number, endSec: number) => ({
  id: `${name}-${startSec}`,
  tag: name,
  start: startSec * NS,
  end: endSec * NS,
});

/** Renders the source and returns what it contributed. */
function contribute(): EpisodeIntervalContribution {
  let seen: EpisodeIntervalContribution | undefined;
  const Component = temporalTagIntervalSource.Component;
  render(
    <Component ctx={CTX}>
      {(contribution) => {
        seen = contribution;
        return null;
      }}
    </Component>,
  );
  if (!seen) throw new Error("source contributed nothing at all");
  return seen;
}

beforeEach(() => {
  state.activeValues = [];
  state.fieldActive = false;
  useSampleRendererTemporalTags.mockReset();
  useSampleRendererTemporalTags.mockReturnValue({ temporalTags: [] });
});

describe("temporalTagIntervalSource", () => {
  it("declares a namespaced id, so it can be a timeline section", () => {
    expect(temporalTagIntervalSource.id).toContain(":");
    expect(temporalTagIntervalSource.label).toBe("Temporal tags");
  });

  it("contributes nothing, and fetches nothing, when neither field nor filter is active", () => {
    // This gate is the only thing between an unfiltered grid and one tag
    // request per tile, so it must not even reach the fetching hook.
    const contribution = contribute();

    expect(contribution.intervals).toEqual([]);
    expect(useSampleRendererTemporalTags).not.toHaveBeenCalled();
  });

  it("contributes every tag when the field is enabled", () => {
    state.fieldActive = true;
    useSampleRendererTemporalTags.mockReturnValue({
      temporalTags: [tag("a", 0, 1), tag("b", 2, 3)],
    });

    const contribution = contribute();

    expect(contribution.intervals.map((i) => i.eventName).sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("narrows to the filtered values when only a filter is active", () => {
    state.activeValues = ["a"];
    useSampleRendererTemporalTags.mockReturnValue({
      temporalTags: [tag("a", 0, 1), tag("b", 2, 3)],
    });

    const contribution = contribute();

    expect(contribution.intervals.map((i) => i.eventName)).toEqual(["a"]);
  });

  it("carries the tag's own colour and span", () => {
    state.activeValues = ["a"];
    useSampleRendererTemporalTags.mockReturnValue({
      temporalTags: [tag("a", 1, 2)],
    });

    expect(contribute().intervals[0]).toMatchObject({
      sourceId: temporalTagIntervalSource.id,
      eventName: "a",
      color: "color-a",
      startNs: 1 * NS,
      endNs: 2 * NS,
    });
  });

  it("groups repeated occurrences of one tag as separate intervals", () => {
    state.activeValues = ["a"];
    useSampleRendererTemporalTags.mockReturnValue({
      temporalTags: [tag("a", 0, 1), tag("a", 5, 6)],
    });

    expect(contribute().intervals).toHaveLength(2);
  });

  it("pins only what the filter selected, never the whole field", () => {
    // Enabling the pseudo-field shows the lane; it is not a request to pin
    // every tag in the modal.
    state.fieldActive = true;
    useSampleRendererTemporalTags.mockReturnValue({
      temporalTags: [tag("a", 0, 1), tag("b", 2, 3)],
    });

    expect(contribute().pinnedRowKeys).toEqual([]);
  });

  it("pins the filtered values", () => {
    state.activeValues = ["a", "b"];
    useSampleRendererTemporalTags.mockReturnValue({
      temporalTags: [tag("a", 0, 1)],
    });

    expect(contribute().pinnedRowKeys).toEqual(["a", "b"]);
  });

  it("reports the extent of every tag, not just the shown ones", () => {
    // Otherwise narrowing a filter would rescale the tile's time axis.
    state.activeValues = ["a"];
    useSampleRendererTemporalTags.mockReturnValue({
      temporalTags: [tag("a", 0, 1), tag("b", 8, 9)],
    });

    expect(contribute().domainEndNs).toBe(9 * NS);
  });

  it("reports a zero extent for a sample with no tags", () => {
    state.fieldActive = true;

    expect(contribute().domainEndNs).toBe(0);
  });
});
