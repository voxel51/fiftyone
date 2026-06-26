import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PlaybackProvider,
  usePlayback,
  usePlaybackStore,
} from "../../lib/playback/PlaybackProvider";
import { playheadAtom } from "../../lib/playback/atoms";
import TimelineTrack, { TimelineTrackProps } from "./TimelineTrack";
import styles from "./TimelineTrack.module.css";

/**
 * Reads the playhead so tests can assert post-action state without
 * touching the store directly.
 */
function PlayheadReadout() {
  const store = usePlaybackStore();
  const t = useAtomValue(playheadAtom, { store });
  return <span data-testid="playhead">{t.toFixed(3)}</span>;
}

function ViewSetter({ start, end }: { start: number; end: number }) {
  const { setView } = usePlayback();
  useEffect(() => {
    setView(start, end);
    // setView is a referentially-stable Jotai setter from usePlayback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);
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
    </PlaybackProvider>,
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

    it("clicking an event marker seeks to the click position along the lane", () => {
      const { container } = renderTrack({
        track: { start: 0, end: 10, events: [3] },
      });
      const event = container.querySelector(`.${styles.event}`) as HTMLElement;
      // The event's onClick now computes the seek time from clientX so
      // long interval bars can be scrubbed precisely. clientX:250 on a
      // 1000-wide lane → 25% of view [0, 10] = 2.5s, regardless of the
      // event's own startSec.
      fireEvent.click(event, { clientX: 250 });
      expect(screen.getByTestId("playhead").textContent).toBe("2.500");
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

  describe("eventMenuItems", () => {
    const interval = { startSec: 4, endSec: 6 };

    it("adds no custom items (and renders fine) when eventMenuItems is absent", () => {
      const { container } = renderTrack({
        track: { start: 0, end: 10, events: [interval], labelWidth: 100 },
      });
      const bar = container.querySelector(
        `.${styles.intervalBar}`,
      ) as HTMLElement;
      expect(bar).not.toBeNull();
      fireEvent.contextMenu(bar);
      expect(screen.queryByText("Delete track")).toBeNull();
    });

    it("fires an item's onSelect with the event the menu opened on", () => {
      const onSelect = vi.fn();
      const { container } = renderTrack({
        track: {
          start: 0,
          end: 10,
          events: [interval],
          eventMenuItems: [
            { label: "Delete track", destructive: true, onSelect },
          ],
        },
      });
      const bar = container.querySelector(
        `.${styles.intervalBar}`,
      ) as HTMLElement;
      fireEvent.contextMenu(bar);
      fireEvent.click(screen.getByText("Delete track"));
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect.mock.calls[0][0]).toMatchObject({
        startSec: 4,
        endSec: 6,
      });
    });

    it("renders every supplied item in order (e.g. delete + split + merge)", () => {
      const { container } = renderTrack({
        track: {
          start: 0,
          end: 10,
          events: [interval],
          eventMenuItems: [
            { label: "Delete track", destructive: true, onSelect: vi.fn() },
            { label: "Split at playhead", onSelect: vi.fn() },
            { label: "Merge into B", onSelect: vi.fn() },
          ],
        },
      });
      const bar = container.querySelector(
        `.${styles.intervalBar}`,
      ) as HTMLElement;
      fireEvent.contextMenu(bar);
      expect(screen.getByText("Delete track")).toBeTruthy();
      expect(screen.getByText("Split at playhead")).toBeTruthy();
      expect(screen.getByText("Merge into B")).toBeTruthy();
    });

    it("does not fire onSelect for a disabled item", () => {
      const onSelect = vi.fn();
      const { container } = renderTrack({
        track: {
          start: 0,
          end: 10,
          events: [interval],
          eventMenuItems: [{ label: "Merge into…", disabled: true, onSelect }],
        },
      });
      const bar = container.querySelector(
        `.${styles.intervalBar}`,
      ) as HTMLElement;
      fireEvent.contextMenu(bar);
      fireEvent.click(screen.getByText("Merge into…"));
      expect(onSelect).not.toHaveBeenCalled();
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
        /background:\s*(#ff000055|rgba\(255,\s*0,\s*0,\s*0\.33)/,
      );
    });
  });

  describe("resizable interval events", () => {
    /**
     * Fire a pointer-down on the element via React's synthetic-event
     * path so onPointerDown handlers run, then dispatch document-level
     * pointermove / pointerup that the drag handler listens for.
     */
    const dragOnElement = (el: HTMLElement, from: number, to: number) => {
      fireEvent.mouseDown(el, { clientX: from, button: 0 });
      const move = new MouseEvent("mousemove", {
        clientX: to,
        bubbles: true,
      });
      document.dispatchEvent(move);
      const up = new MouseEvent("mouseup", { clientX: to, bubbles: true });
      document.dispatchEvent(up);
    };

    const baseInterval = {
      startSec: 4,
      endSec: 6,
      resizable: true as const,
    };

    it("renders both resize handles on a resizable interval when onEventEdit is provided", () => {
      const { container } = renderTrack({
        track: {
          start: 0,
          end: 10,
          events: [baseInterval],
          onEventEdit: vi.fn(),
        },
      });
      const handles = container.querySelectorAll(`.${styles.resizeHandle}`);
      expect(handles).toHaveLength(2);
      expect(
        container.querySelector(`.${styles.resizeHandleStart}`),
      ).not.toBeNull();
      expect(
        container.querySelector(`.${styles.resizeHandleEnd}`),
      ).not.toBeNull();
    });

    it("does not render handles when resizable is true but onEventEdit is missing", () => {
      const { container } = renderTrack({
        track: { start: 0, end: 10, events: [baseInterval] },
      });
      expect(
        container.querySelectorAll(`.${styles.resizeHandle}`),
      ).toHaveLength(0);
    });

    it("does not render handles when the event opts out of resizable", () => {
      const { container } = renderTrack({
        track: {
          start: 0,
          end: 10,
          events: [{ startSec: 4, endSec: 6 }],
          onEventEdit: vi.fn(),
        },
      });
      expect(
        container.querySelectorAll(`.${styles.resizeHandle}`),
      ).toHaveLength(0);
    });

    it("commits a resize-end drag with the new endSec", () => {
      const onEventEdit = vi.fn();
      const { container } = renderTrack({
        track: {
          start: 0,
          end: 10,
          events: [baseInterval],
          onEventEdit,
        },
      });
      const endHandle = container.querySelector(
        `.${styles.resizeHandleEnd}`,
      ) as HTMLElement;
      // Lane is 1000px wide for view [0, 10] → 100px per second.
      // Drag end handle right by 200px → +2s on endSec (4→6 becomes 4→8).
      dragOnElement(endHandle, 600, 800);
      expect(onEventEdit).toHaveBeenCalledTimes(1);
      const [idx, newStart, newEnd] = onEventEdit.mock.calls[0];
      expect(idx).toBe(0);
      expect(newStart).toBeCloseTo(4);
      expect(newEnd).toBeCloseTo(8);
    });

    it("commits a resize-start drag with the new startSec", () => {
      const onEventEdit = vi.fn();
      const { container } = renderTrack({
        track: {
          start: 0,
          end: 10,
          events: [baseInterval],
          onEventEdit,
        },
      });
      const startHandle = container.querySelector(
        `.${styles.resizeHandleStart}`,
      ) as HTMLElement;
      // Drag start handle left by 100px → -1s on startSec (4→6 becomes 3→6).
      dragOnElement(startHandle, 400, 300);
      expect(onEventEdit).toHaveBeenCalledTimes(1);
      const [idx, newStart, newEnd] = onEventEdit.mock.calls[0];
      expect(idx).toBe(0);
      expect(newStart).toBeCloseTo(3);
      expect(newEnd).toBeCloseTo(6);
    });

    it("commits a body-drag (move) with both endpoints shifted by the same delta", () => {
      const onEventEdit = vi.fn();
      const { container } = renderTrack({
        track: {
          start: 0,
          end: 10,
          events: [baseInterval],
          onEventEdit,
        },
      });
      const bar = container.querySelector(
        `.${styles.intervalBar}`,
      ) as HTMLElement;
      // Drag bar right by 100px → +1s on both endpoints (4→6 becomes 5→7).
      dragOnElement(bar, 500, 600);
      expect(onEventEdit).toHaveBeenCalledTimes(1);
      const [idx, newStart, newEnd] = onEventEdit.mock.calls[0];
      expect(idx).toBe(0);
      expect(newStart).toBeCloseTo(5);
      expect(newEnd).toBeCloseTo(7);
    });

    it("snaps drag results to snapStepSec when provided", () => {
      const onEventEdit = vi.fn();
      const { container } = renderTrack({
        track: {
          start: 0,
          end: 10,
          events: [baseInterval],
          onEventEdit,
          // 5 fps → step 0.2s. View [0,10] over 1000px → 100px/s → 20px/step.
          snapStepSec: 0.2,
        },
      });
      const endHandle = container.querySelector(
        `.${styles.resizeHandleEnd}`,
      ) as HTMLElement;
      // 175px right of pointer-down clientX 600 → 1.75s raw delta; new
      // endSec ≈ 7.75; rounded to nearest 0.2 → 7.8.
      dragOnElement(endHandle, 600, 775);
      const [, , newEnd] = onEventEdit.mock.calls[0];
      expect(newEnd).toBeCloseTo(7.8);
    });

    it("clamps resize-end to a minimum width of snapStepSec", () => {
      const onEventEdit = vi.fn();
      const { container } = renderTrack({
        track: {
          start: 0,
          end: 10,
          events: [baseInterval],
          onEventEdit,
          snapStepSec: 0.2,
        },
      });
      const endHandle = container.querySelector(
        `.${styles.resizeHandleEnd}`,
      ) as HTMLElement;
      // Drag end handle far left past start (4) → should clamp to start+0.2.
      dragOnElement(endHandle, 600, 0);
      const [, newStart, newEnd] = onEventEdit.mock.calls[0];
      expect(newStart).toBeCloseTo(4);
      expect(newEnd).toBeCloseTo(4.2);
    });

    it("clamps resize-start to a minimum width of snapStepSec", () => {
      const onEventEdit = vi.fn();
      const { container } = renderTrack({
        track: {
          start: 0,
          end: 10,
          events: [baseInterval],
          onEventEdit,
          snapStepSec: 0.2,
        },
      });
      const startHandle = container.querySelector(
        `.${styles.resizeHandleStart}`,
      ) as HTMLElement;
      // Drag start handle far right past end (6) → should clamp to end-0.2.
      dragOnElement(startHandle, 400, 1000);
      const [, newStart, newEnd] = onEventEdit.mock.calls[0];
      expect(newStart).toBeCloseTo(5.8);
      expect(newEnd).toBeCloseTo(6);
    });

    it("does not commit when the pointer never moves past the drag threshold", () => {
      const onEventEdit = vi.fn();
      const { container } = renderTrack({
        track: {
          start: 0,
          end: 10,
          events: [baseInterval],
          onEventEdit,
        },
      });
      const endHandle = container.querySelector(
        `.${styles.resizeHandleEnd}`,
      ) as HTMLElement;
      // Move by 2px (under DRAG_THRESHOLD_PX = 3).
      dragOnElement(endHandle, 600, 602);
      expect(onEventEdit).not.toHaveBeenCalled();
    });

    it("suppresses the lane seek-click that follows a real drag", () => {
      const onEventEdit = vi.fn();
      const { container } = renderTrack({
        track: {
          start: 0,
          end: 10,
          events: [baseInterval],
          onEventEdit,
        },
      });
      const bar = container.querySelector(
        `.${styles.intervalBar}`,
      ) as HTMLElement;
      // Simulate drag + the synthetic click that mouseup triggers.
      fireEvent.mouseDown(bar, { clientX: 500 });
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 600, bubbles: true }),
      );
      document.dispatchEvent(
        new MouseEvent("mouseup", { clientX: 600, bubbles: true }),
      );
      // Browser would then fire click on the bar (and bubble to lane).
      fireEvent.click(bar, { clientX: 600 });

      // onEventEdit captured the drag; the playhead should NOT have moved
      // to clientX 600 (which would be 6s).
      expect(onEventEdit).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("playhead").textContent).toBe("0.000");
    });
  });
});
