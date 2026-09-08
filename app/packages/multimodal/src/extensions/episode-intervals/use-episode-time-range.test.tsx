import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  publishEpisodePlayhead,
  publishEpisodeTimeRange,
  releaseEpisodePlayhead,
  resetEpisodePlayheadsForTests,
} from "../../runtime";
// Not on the runtime barrel, which exposes only the production surface.
import { resetEpisodeTimeRangesForTests } from "../../runtime/episode-time-range-registry";
import {
  toEpisodeRelativeNs,
  useEpisodePlayheadNs,
  useEpisodeTimeRange,
} from "./use-episode-time-range";

const START = 1_800_000_000_000_000_000n;
const RANGE = { startNs: START, endNs: START + 60_000_000_000n };

afterEach(() => {
  resetEpisodeTimeRangesForTests();
  resetEpisodePlayheadsForTests();
});

describe("toEpisodeRelativeNs", () => {
  it("rebases an instant onto the episode's zero", () => {
    expect(toEpisodeRelativeNs(START + 1_500_000_000n, RANGE)).toBe(
      1_500_000_000,
    );
  });

  it("returns zero at the episode start", () => {
    expect(toEpisodeRelativeNs(START, RANGE)).toBe(0);
  });

  it("does the subtraction in bigint, so no precision is lost", () => {
    // Converting the absolute values to numbers first would collapse instants a
    // nanosecond apart onto the same float; the difference must survive.
    const a = toEpisodeRelativeNs(START + 1n, RANGE);
    const b = toEpisodeRelativeNs(START + 2n, RANGE);

    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it("goes negative for an instant before the episode start", () => {
    // Not clamped here: a caller drawing the lane decides what to do with an
    // out-of-range mark, and silently moving it would hide bad data.
    expect(toEpisodeRelativeNs(START - 5n, RANGE)).toBe(-5);
  });
});

describe("useEpisodeTimeRange", () => {
  it("is null before anything publishes", () => {
    const { result } = renderHook(() => useEpisodeTimeRange("ep"));

    expect(result.current).toBeNull();
  });

  it("is null for an undefined episode id", () => {
    const { result } = renderHook(() => useEpisodeTimeRange(undefined));

    expect(result.current).toBeNull();
  });

  it("reads a range published before mount", () => {
    publishEpisodeTimeRange("ep", RANGE);

    const { result } = renderHook(() => useEpisodeTimeRange("ep"));

    expect(result.current).toEqual(RANGE);
  });

  it("updates when a range is published after mount", () => {
    const { result } = renderHook(() => useEpisodeTimeRange("ep"));

    act(() => publishEpisodeTimeRange("ep", RANGE));

    expect(result.current).toEqual(RANGE);
  });

  it("ignores another episode's range", () => {
    const { result } = renderHook(() => useEpisodeTimeRange("ep"));

    act(() => publishEpisodeTimeRange("other", RANGE));

    expect(result.current).toBeNull();
  });
});

describe("useEpisodePlayheadNs", () => {
  it("is null when the axis is unknown, even with a playhead", () => {
    // An absolute instant cannot be placed without an origin, so the caller has
    // to be told "not yet" rather than handed an unrebased value.
    publishEpisodePlayhead("ep", START + 1_000_000_000n);

    const { result } = renderHook(() => useEpisodePlayheadNs("ep", null));

    expect(result.current).toBeNull();
  });

  it("is null when the axis is known but nothing is presenting", () => {
    const { result } = renderHook(() => useEpisodePlayheadNs("ep", RANGE));

    expect(result.current).toBeNull();
  });

  it("rebases the published instant onto the episode axis", () => {
    const { result } = renderHook(() => useEpisodePlayheadNs("ep", RANGE));

    act(() => publishEpisodePlayhead("ep", START + 2_000_000_000n));

    expect(result.current).toBe(2_000_000_000);
  });

  it("follows the playhead as it advances", () => {
    const { result } = renderHook(() => useEpisodePlayheadNs("ep", RANGE));

    act(() => publishEpisodePlayhead("ep", START + 1_000_000_000n));
    expect(result.current).toBe(1_000_000_000);

    act(() => publishEpisodePlayhead("ep", START + 3_000_000_000n));
    expect(result.current).toBe(3_000_000_000);
  });

  it("returns to null once the tile stops presenting", () => {
    const { result } = renderHook(() => useEpisodePlayheadNs("ep", RANGE));
    act(() => publishEpisodePlayhead("ep", START + 1_000_000_000n));

    act(() => releaseEpisodePlayhead("ep"));

    expect(result.current).toBeNull();
  });

  it("ignores another episode's playhead", () => {
    const { result } = renderHook(() => useEpisodePlayheadNs("ep", RANGE));

    act(() => publishEpisodePlayhead("other", START + 1_000_000_000n));

    expect(result.current).toBeNull();
  });
});
