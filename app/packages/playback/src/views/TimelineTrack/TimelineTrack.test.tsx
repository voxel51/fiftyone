import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackProvider, usePlayback } from "../../lib/playback/PlaybackProvider";
import { playheadAtom } from "../../lib/playback/atoms";
import TimelineTrack, { TimelineTrackProps } from "./TimelineTrack";
import styles from "./TimelineTrack.module.css";

/**
 * Reads the playhead so tests can assert post-action state without
 * touching the store directly.
 */
function PlayheadReadout() {
  const t = useAtomValue(playheadAtom);
  return <span data-testid="playhead">{t.toFixed(3)}</span>;
}

function ViewSetter({ start, end }: { start: number; end: number }) {
  const { setView } = usePlayback();
  useEffect(() => {
    setView(start, end);
  }, [setView, start, end]);
  return null;
}

const baseTrack: TimelineTrackProps = {
  id: "camera_front",
  color: "#4a9eff",
  start: 2,
  end: 8,
  events: [3, 5, 7],
};

interface RenderOpts {
  track?: Partial<TimelineTrackProps>;
  duration?: number;
  viewStart?: number;
  viewEnd?: number;
}

function renderTrack(opts: RenderOpts = {}) {
  const { track = {}, duration = 10, viewStart, viewEnd } = opts;
  return render(
    <PlaybackProvider duration={duration} stepInterval={1 / 30}>
      {viewStart !== undefined && viewEnd !== undefined ? (
        <ViewSetter start={viewStart} end={viewEnd} />
      ) : null}
      <TimelineTrack {...baseTrack} {...track} />
      <PlayheadReadout />
    </PlaybackProvider>
  );
}

const inlineStyle = (el: Element): string => el.getAttribute("style") ?? "";

describe("TimelineTrack", () => {
  beforeEach(() => {
    // Lane click handler measures via getBoundingClientRect. jsdom returns
    // zeroes by default; stub a known rect so the math is deterministic.
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

  afterEach(() => cleanup());

  describe("structure", () => {
    it("renders the root, lane, and bar by default", () => {
      const { container } = renderTrack();
      expect(container.querySelector(`.${styles.root}`)).not.toBeNull();
      expect(container.querySelector(`.${styles.lane}`)).not.toBeNull();
      expect(container.querySelector(`.${styles.bar}`)).not.toBeNull();
    });

    it("omits the label column when labelWidth is 0", () => {
      const { container } = renderTrack();
      expect(container.querySelector(`.${styles.label}`)).toBeNull();
    });

    it("renders the label with id text, color dot, and the given width", () => {
      const { container } = renderTrack({ track: { labelWidth: 150 } });
      const label = container.querySelector(`.${styles.label}`) as HTMLElement;
      expect(label).not.toBeNull();
      expect(inlineStyle(label)).toContain("width: 150px");
      expect(screen.getByText("camera_front")).toBeTruthy();
      const dot = container.querySelector(`.${styles.dot}`) as HTMLElement;
      expect(dot).not.toBeNull();
      expect(inlineStyle(dot)).toContain("background");
    });

    it("applies the height prop to the root container", () => {
      const { container } = renderTrack({ track: { height: 40 } });
      const root = container.querySelector(`.${styles.root}`) as HTMLElement;
      expect(inlineStyle(root)).toContain("height: 40px");
    });
  });

  describe("bar visibility", () => {
    it("renders the bar when the track range overlaps the view", () => {
      const { container } = renderTrack({
        track: { start: 2, end: 8 },
        viewStart: 0,
        viewEnd: 10,
      });
      expect(container.querySelector(`.${styles.bar}`)).not.toBeNull();
    });

    it("hides the bar when the track ends before the view starts", () => {
      const { container } = renderTrack({
        track: { start: 0, end: 2 },
        viewStart: 5,
        viewEnd: 10,
      });
      expect(container.querySelector(`.${styles.bar}`)).toBeNull();
    });

    it("hides the bar when the track starts after the view ends", () => {
      const { container } = renderTrack({
        track: { start: 12, end: 15 },
        duration: 20,
        viewStart: 0,
        viewEnd: 10,
      });
      expect(container.querySelector(`.${styles.bar}`)).toBeNull();
    });

    it("clips the bar to the visible view window when partially in range", () => {
      const { container } = renderTrack({
        track: { start: -2, end: 5 },
        viewStart: 0,
        viewEnd: 10,
      });
      const bar = container.querySelector(`.${styles.bar}`) as HTMLElement;
      expect(bar).not.toBeNull();
      // Clamped start → left 0%, width = 5/10 = 50%.
      expect(inlineStyle(bar)).toContain("left: 0%");
      expect(inlineStyle(bar)).toContain("width: 50%");
    });

    it("positions the bar by the track's fraction of the view window", () => {
      const { container } = renderTrack({
        track: { start: 2, end: 7 },
        viewStart: 0,
        viewEnd: 10,
      });
      const bar = container.querySelector(`.${styles.bar}`) as HTMLElement;
      expect(inlineStyle(bar)).toContain("left: 20%");
      expect(inlineStyle(bar)).toContain("width: 50%");
    });
  });

  describe("events", () => {
    it("renders only the events inside the view window", () => {
      const { container } = renderTrack({
        track: { start: 0, end: 10, events: [1, 5, 9] },
        viewStart: 3,
        viewEnd: 7,
      });
      const dots = container.querySelectorAll(`.${styles.event}`);
      // Only the event at t=5 falls within [3, 7].
      expect(dots).toHaveLength(1);
    });

    it("positions each event by its fraction of the view window", () => {
      const { container } = renderTrack({
        track: { start: 0, end: 10, events: [2.5, 7.5] },
      });
      const dots = container.querySelectorAll<HTMLElement>(`.${styles.event}`);
      expect(dots).toHaveLength(2);
      expect(inlineStyle(dots[0])).toContain("left: 25%");
      expect(inlineStyle(dots[1])).toContain("left: 75%");
    });

    it("annotates each event with a title containing id and timestamp", () => {
      renderTrack({
        track: { id: "imu", start: 0, end: 10, events: [4.5] },
      });
      expect(screen.getByTitle("imu @ 4.500s")).toBeTruthy();
    });

    it("handles the no-events case (empty events array)", () => {
      const { container } = renderTrack({
        track: { start: 0, end: 10, events: [] },
      });
      expect(container.querySelectorAll(`.${styles.event}`)).toHaveLength(0);
    });
  });

  describe("lane click → seek", () => {
    it("seeks to the proportional time when the lane is clicked", () => {
      const { container } = renderTrack({ duration: 10 });
      const lane = container.querySelector(`.${styles.lane}`) as HTMLElement;
      // Click at x=250 on a 1000-wide lane → 25% of view [0, 10] = 2.5s.
      fireEvent.click(lane, { clientX: 250 });
      expect(screen.getByTestId("playhead").textContent).toBe("2.500");
    });

    it("uses the current view window when computing the seek time", () => {
      const { container } = renderTrack({
        duration: 10,
        viewStart: 4,
        viewEnd: 8,
      });
      const lane = container.querySelector(`.${styles.lane}`) as HTMLElement;
      // 50% of a [4, 8] window → 6s.
      fireEvent.click(lane, { clientX: 500 });
      expect(screen.getByTestId("playhead").textContent).toBe("6.000");
    });

    it("clicking an event marker seeks to that event's start time", () => {
      const { container } = renderTrack({
        track: { start: 0, end: 10, events: [3] },
      });
      const event = container.querySelector(`.${styles.event}`) as HTMLElement;
      // The lane's click handler short-circuits on event targets so we
      // don't double-seek; the event's own click handler seeks to its
      // startSec (3 here).
      fireEvent.click(event, { clientX: 250 });
      expect(screen.getByTestId("playhead").textContent).toBe("3.000");
    });
  });

  describe("pin button", () => {
    it("does not render when onPinClick is omitted", () => {
      renderTrack({ track: { labelWidth: 150 } });
      expect(screen.queryByRole("button")).toBeNull();
    });

    it("renders with the 'Pin track' label when unpinned", () => {
      const onPinClick = vi.fn();
      renderTrack({ track: { labelWidth: 150, onPinClick } });
      expect(screen.getByRole("button", { name: "Pin track" })).toBeTruthy();
    });

    it("renders with the 'Unpin track' label when pinned", () => {
      const onPinClick = vi.fn();
      renderTrack({
        track: { labelWidth: 150, onPinClick, pinned: true },
      });
      expect(screen.getByRole("button", { name: "Unpin track" })).toBeTruthy();
    });

    it("invokes onPinClick when clicked", () => {
      const onPinClick = vi.fn();
      renderTrack({ track: { labelWidth: 150, onPinClick } });
      fireEvent.click(screen.getByRole("button", { name: "Pin track" }));
      expect(onPinClick).toHaveBeenCalledTimes(1);
    });

    it("does not propagate the pin click to the lane (no seek)", () => {
      const onPinClick = vi.fn();
      renderTrack({ track: { labelWidth: 150, onPinClick } });
      fireEvent.click(screen.getByRole("button", { name: "Pin track" }), {
        clientX: 500,
      });
      expect(screen.getByTestId("playhead").textContent).toBe("0.000");
    });
  });

  describe("onContextMenu", () => {
    it("wires onContextMenu to the root container", () => {
      const onContextMenu = vi.fn();
      const { container } = renderTrack({ track: { onContextMenu } });
      const root = container.querySelector(`.${styles.root}`) as HTMLElement;
      fireEvent.contextMenu(root);
      expect(onContextMenu).toHaveBeenCalledTimes(1);
    });
  });

  describe("color + bg props", () => {
    it("uses the `bg` prop verbatim for the bar background when provided", () => {
      const { container } = renderTrack({
        track: { color: "#ff0000", bg: "rgb(0, 255, 0)" },
      });
      const bar = container.querySelector(`.${styles.bar}`) as HTMLElement;
      expect(inlineStyle(bar)).toContain("background: rgb(0, 255, 0)");
    });

    it("falls back to a translucent `color`+55 bar background when bg is omitted", () => {
      const { container } = renderTrack({ track: { color: "#ff0000" } });
      const bar = container.querySelector(`.${styles.bar}`) as HTMLElement;
      // JSDOM normalizes #ff000055 to rgba(255, 0, 0, 0.333).
      expect(inlineStyle(bar).toLowerCase()).toMatch(
        /background:\s*(#ff000055|rgba\(255,\s*0,\s*0,\s*0\.33)/
      );
    });
  });
});
