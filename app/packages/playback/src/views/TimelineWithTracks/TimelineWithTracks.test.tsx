import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import React from "react";
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
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("empty state (no tracks)", () => {
    it("renders the root container with the noTracks modifier", () => {
      const { container } = renderTimeline({ tracks: [] });
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).toContain(styles.noTracks);
    });

    it("does not render the tracks area when there are no tracks", () => {
      const { container } = renderTimeline({ tracks: [] });
      // noTracks branch skips the Drawer entirely — no tracksOuter section
      expect(container.querySelector(`.${styles.tracksOuter}`)).toBeNull();
    });
  });

  describe("with tracks", () => {
    it("renders the root container without the noTracks class", () => {
      const { container } = renderTimeline({
        tracks: [TRACK_A],
        pinnedIds: ["track-a"],
      });
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).not.toContain(styles.noTracks);
    });

    it("renders a pinned track exactly once", () => {
      renderTimeline({ tracks: [TRACK_A, TRACK_B], pinnedIds: ["track-a"] });
      // With the drawer closed (default) a pinned row lives only in the header
      // overlay — not also in the body — so it mounts once under one track id.
      expect(screen.getAllByText("Track A")).toHaveLength(1);
    });

    it("renders rows for both pinned and unpinned tracks", () => {
      renderTimeline({
        tracks: [TRACK_A, TRACK_B],
        pinnedIds: ["track-a"],
      });
      expect(screen.getAllByText("Track A").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Track B").length).toBeGreaterThan(0);
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
