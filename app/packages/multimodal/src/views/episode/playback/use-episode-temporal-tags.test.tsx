import {
  PlaybackProvider,
  TimelineWithTracks,
  TrackProvider,
  usePinnedTracks,
  type Track,
} from "@fiftyone/playback";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Drives what the grid is "filtered by". `useFilteredTemporalTagPinnedIds`
// reads this through `@fiftyone/state`.
const stateMock = vi.hoisted(() => ({ values: [] as string[] }));

vi.mock("@fiftyone/state", () => ({
  useActiveTemporalTagFilterValues: () => stateMock.values,
}));

import { useFilteredTemporalTagPinnedIds } from "./use-episode-temporal-tags";

const REVIEW: Track = {
  id: "temporal-tag::review",
  label: "review",
  color: "#f97316",
  events: [{ startSec: 2, endSec: 4, label: "review" }],
};
const KEEP: Track = {
  id: "temporal-tag::keep",
  label: "keep",
  color: "#3b82f6",
  events: [{ startSec: 6, endSec: 8, label: "keep" }],
};

afterEach(() => {
  cleanup();
  stateMock.values = [];
  vi.restoreAllMocks();
});

describe("useFilteredTemporalTagPinnedIds", () => {
  it("maps the active filter values to temporal-tag track ids", () => {
    stateMock.values = ["review", "keep"];
    const { result } = renderHook(() => useFilteredTemporalTagPinnedIds());
    expect(result.current).toEqual([
      "temporal-tag::review",
      "temporal-tag::keep",
    ]);
  });

  it("returns no ids when the grid is not filtered by temporal tags", () => {
    stateMock.values = [];
    const { result } = renderHook(() => useFilteredTemporalTagPinnedIds());
    expect(result.current).toEqual([]);
  });
});

describe("opening the modal from a temporal-tag-filtered grid", () => {
  beforeEach(() => {
    // TimelineWithTracks uses ResizeObserver (useElementSize); the track lane
    // measures via getBoundingClientRect. jsdom needs stubs for both.
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 28,
      width: 1000,
      height: 28,
      toJSON: () => ({}),
    }));
  });

  function PinnedProbe() {
    const pinned = usePinnedTracks();
    return (
      <span data-testid="pinned">{pinned.map((t) => t.id).join(",")}</span>
    );
  }

  // Mirrors EpisodeModalRenderer: pins are derived from the grid filter, tracks
  // come from the sample's temporal tags.
  function Harness() {
    const pinnedTrackIds = useFilteredTemporalTagPinnedIds();
    return (
      <PlaybackProvider duration={10} stepInterval={1 / 30}>
        <TrackProvider
          tracks={[REVIEW, KEEP]}
          initialPinnedIds={pinnedTrackIds}
        >
          <TimelineWithTracks />
          <PinnedProbe />
        </TrackProvider>
      </PlaybackProvider>
    );
  }

  it("pins the filtered tag's track and places its interval correctly", () => {
    stateMock.values = ["review"]; // grid filtered by the "review" tag

    render(<Harness />);

    // Proper track: only the "review" track is pinned; "keep" is not.
    expect(screen.getByTestId("pinned").textContent).toBe(
      "temporal-tag::review",
    );

    // Correct place: the review interval (2–4s) over the default [0, 10] view
    // sits at left 20%, width 20%.
    const bar = screen.getByTitle(/review\s+\(2\.00.4\.00s\)/);
    const style = bar.getAttribute("style") ?? "";
    expect(style).toContain("left: 20%");
    expect(style).toContain("width: 20%");
  });

  it("pins nothing when the grid is not filtered by temporal tags", () => {
    stateMock.values = [];

    render(<Harness />);

    expect(screen.getByTestId("pinned").textContent).toBe("");
  });
});
