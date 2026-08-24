import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import { TrackProvider, type Track } from "../../lib/tracks/TrackProvider";
import TimelineWithTracks from "./TimelineWithTracks";
import styles from "./TimelineWithTracks.module.css";

const TRACK_A: Track = {
  id: "track-a",
  label: "Track A",
  color: "#4a9eff",
  events: [{ startSec: 1, endSec: 3 }],
};
const TRACK_B: Track = {
  id: "track-b",
  label: "Track B",
  color: "#ff6b6b",
  events: [],
};

interface RenderOpts {
  tracks?: Track[];
  pinnedIds?: string[];
  duration?: number;
  labelWidth?: number;
}

function renderTimeline(opts: RenderOpts = {}) {
  const { tracks = [], pinnedIds = [], duration = 10, labelWidth } = opts;

  return render(
    <PlaybackProvider duration={duration} stepInterval={1 / 30}>
      <TrackProvider tracks={tracks} initialPinnedIds={pinnedIds}>
        <TimelineWithTracks labelWidth={labelWidth} />
      </TrackProvider>
    </PlaybackProvider>,
  );
}

describe("TimelineWithTracks", () => {
  beforeEach(() => {
    // useElementSize relies on ResizeObserver which jsdom doesn't support.
    // Provide a no-op stub so the hook mounts without errors.
    global.ResizeObserver = vi.fn().mockImplementation(function () {
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("empty state (no tracks)", () => {
    it("does not render the tracks area when there are no tracks", () => {
      const { container } = renderTimeline({ tracks: [] });
      // noTracks branch skips the Drawer entirely — no tracksOuter section
      expect(container.querySelector(`.${styles.tracksOuter}`)).toBeNull();
    });
  });

  describe("shrinking track list", () => {
    // The virtualizer renders from the range it last measured, so a list that
    // shrinks transiently addresses rows past the new end. Reading through
    // those undefined rows used to throw and take the tree down — which is how
    // deleting the last track broke the annotation surface.
    it("survives every track being removed", () => {
      const { rerender } = render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TrackProvider tracks={[TRACK_A, TRACK_B]} initialPinnedIds={[]}>
            <TimelineWithTracks />
          </TrackProvider>
        </PlaybackProvider>,
      );
      expect(screen.getAllByText("Track A").length).toBeGreaterThan(0);

      expect(() =>
        rerender(
          <PlaybackProvider duration={10} stepInterval={1 / 30}>
            <TrackProvider tracks={[]} initialPinnedIds={[]}>
              <TimelineWithTracks />
            </TrackProvider>
          </PlaybackProvider>,
        ),
      ).not.toThrow();

      expect(screen.queryByText("Track A")).toBeNull();
    });

    it("survives the list shrinking to a single track", () => {
      const { rerender } = render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TrackProvider tracks={[TRACK_A, TRACK_B]} initialPinnedIds={[]}>
            <TimelineWithTracks />
          </TrackProvider>
        </PlaybackProvider>,
      );

      expect(() =>
        rerender(
          <PlaybackProvider duration={10} stepInterval={1 / 30}>
            <TrackProvider tracks={[TRACK_B]} initialPinnedIds={[]}>
              <TimelineWithTracks />
            </TrackProvider>
          </PlaybackProvider>,
        ),
      ).not.toThrow();

      expect(screen.getAllByText("Track B").length).toBeGreaterThan(0);
    });
  });

  describe("with tracks", () => {
    it("renders track labels for registered tracks", () => {
      renderTimeline({ tracks: [TRACK_A, TRACK_B], pinnedIds: ["track-a"] });
      expect(screen.getByText("Track A")).toBeTruthy();
    });

    it("renders rows for both pinned and unpinned tracks", () => {
      renderTimeline({
        tracks: [TRACK_A, TRACK_B],
        pinnedIds: ["track-a"],
      });
      expect(screen.getAllByText("Track A").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Track B").length).toBeGreaterThan(0);
    });

    it("reports drawer changes when its open state is controlled", () => {
      const onDrawerOpenChange = vi.fn();
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TrackProvider tracks={[TRACK_A]} initialPinnedIds={[]}>
            <TimelineWithTracks
              drawerOpen={false}
              onDrawerOpenChange={onDrawerOpenChange}
            />
          </TrackProvider>
        </PlaybackProvider>,
      );

      fireEvent.click(screen.getByTestId("timeline-controls-divider"));

      expect(onDrawerOpenChange).toHaveBeenCalledOnce();
      expect(onDrawerOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe("label width", () => {
    it("uses 0 label width when there are no tracks", () => {
      // When there are no tracks, labelWidth collapses to 0 so the ruler
      // spans full width. We verify no label column elements are present.
      const { container } = renderTimeline({ tracks: [] });
      // No track label elements in the empty state
      expect(container.querySelectorAll("[class*=label]")).toHaveLength(0);
    });
  });
});
