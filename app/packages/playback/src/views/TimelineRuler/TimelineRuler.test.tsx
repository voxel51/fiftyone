import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAtomValue } from "jotai";
import React, { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PlaybackProvider,
  usePlayback,
  usePlaybackStore,
} from "../../lib/playback/PlaybackProvider";
import { viewEndAtom, viewStartAtom } from "../../lib/playback/atoms";
import { setHoverTime } from "../../lib/playback/store-access";
import type { TimelineMode } from "../../lib/playback/types";
import { useHoverTime } from "../../lib/playback/use-playback-state";
import TimelineRuler from "./TimelineRuler";
import styles from "./TimelineRuler.module.css";

// Renders the current view window to the DOM so tests can assert on
// post-action atom state without touching the store directly.
function ViewReadout() {
  const store = usePlaybackStore();
  const vs = useAtomValue(viewStartAtom, { store });
  const ve = useAtomValue(viewEndAtom, { store });
  return (
    <span data-testid="view">{`${vs.toFixed(3)} / ${ve.toFixed(3)}`}</span>
  );
}

// Renders the shared hover time so tests can assert on the published atom.
function HoverReadout() {
  const hover = useHoverTime();
  return (
    <span data-testid="hover">
      {hover === null ? "none" : hover.toFixed(3)}
    </span>
  );
}

function Seeker({ time }: { time: number }) {
  const { seek } = usePlayback();
  useEffect(() => {
    seek(time);
    // seek is a referentially-stable Jotai setter from usePlayback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time]);
  return null;
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

interface RenderOpts {
  duration?: number;
  labelWidth?: number;
  seekTo?: number;
  viewStart?: number;
  viewEnd?: number;
  defaultLoopStart?: number;
  defaultLoopEnd?: number;
  mode?: TimelineMode;
}

/** Renders the ruler inside a positioned outer so getBoundingClientRect-driven math works. */
function renderRuler(opts: RenderOpts = {}) {
  const {
    duration = 10,
    labelWidth = 0,
    seekTo,
    viewStart,
    viewEnd,
    defaultLoopStart,
    defaultLoopEnd,
    mode,
  } = opts;
  return render(
    <PlaybackProvider
      duration={duration}
      stepInterval={1 / 30}
      defaultLoopStart={defaultLoopStart}
      defaultLoopEnd={defaultLoopEnd}
      mode={mode}
    >
      {viewStart !== undefined && viewEnd !== undefined ? (
        <ViewSetter start={viewStart} end={viewEnd} />
      ) : null}
      {seekTo !== undefined ? <Seeker time={seekTo} /> : null}
      <TimelineRuler labelWidth={labelWidth} />
      <ViewReadout />
      <HoverReadout />
    </PlaybackProvider>,
  );
}

/** Renders with a wrapper element exposed via zoomRef so wheel handlers attach there. */
function renderRulerWithZoomRef(opts: RenderOpts = {}) {
  const Harness = () => {
    const ref = useRef<HTMLDivElement>(null);
    return (
      <div ref={ref} data-testid="zoom-host">
        <TimelineRuler labelWidth={opts.labelWidth ?? 0} zoomRef={ref} />
      </div>
    );
  };
  return render(
    <PlaybackProvider duration={opts.duration ?? 10} stepInterval={1 / 30}>
      {opts.viewStart !== undefined && opts.viewEnd !== undefined ? (
        <ViewSetter start={opts.viewStart} end={opts.viewEnd} />
      ) : null}
      <Harness />
      <ViewReadout />
    </PlaybackProvider>,
  );
}

const inlineStyle = (el: Element): string => el.getAttribute("style") ?? "";

describe("TimelineRuler", () => {
  // Save the original so afterEach can restore Element.prototype — otherwise
  // the stub leaks into later test suites that share the test runner.
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    // The wheel handler reads getBoundingClientRect to convert the cursor's
    // clientX into a lane position. jsdom returns zeroes by default.
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 24,
      width: 1000,
      height: 24,
      toJSON: () => ({}),
    }));
  });

  afterEach(() => {
    cleanup();
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  describe("structure", () => {
    it("renders the ruler, lane, loop handles, and playhead group", () => {
      const { container } = renderRuler();
      expect(container.querySelector(`.${styles.ruler}`)).not.toBeNull();
      expect(container.querySelector(`.${styles.lane}`)).not.toBeNull();
      expect(container.querySelectorAll(`.${styles.loopHandle}`)).toHaveLength(
        2,
      );
      expect(
        container.querySelector(`.${styles.playheadGroup}`),
      ).not.toBeNull();
      expect(
        container.querySelector(`.${styles.playheadHandle}`),
      ).not.toBeNull();
      expect(
        container.querySelector(`.${styles.playheadTriangle}`),
      ).not.toBeNull();
    });

    it("omits the labelSpacer when labelWidth is 0", () => {
      const { container } = renderRuler({ labelWidth: 0 });
      expect(container.querySelector(`.${styles.labelSpacer}`)).toBeNull();
    });

    it("renders the labelSpacer with the requested width when labelWidth > 0", () => {
      const { container } = renderRuler({ labelWidth: 120 });
      const spacer = container.querySelector(`.${styles.labelSpacer}`);
      expect(spacer).not.toBeNull();
      expect(inlineStyle(spacer!)).toContain("width: 120px");
    });

    it("offsets the playhead group by labelWidth", () => {
      const { container } = renderRuler({ labelWidth: 80 });
      const group = container.querySelector(`.${styles.playheadGroup}`);
      expect(inlineStyle(group!)).toContain("left: 80px");
    });

    it("renders the overlay prop inside the ruler's DOM node", () => {
      const Harness = () => {
        const ref = useRef<HTMLDivElement>(null);
        return (
          <PlaybackProvider duration={10} stepInterval={1 / 30}>
            <TimelineRuler
              overlay={<div data-testid="ruler-overlay">over</div>}
              zoomRef={ref}
            />
          </PlaybackProvider>
        );
      };
      render(<Harness />);
      const ruler = screen.getByTestId("timeline-ruler");
      expect(
        ruler.querySelector('[data-testid="ruler-overlay"]'),
      ).not.toBeNull();
    });
  });

  describe("ticks", () => {
    it("uses 1s intervals when the view is wider than 3s", () => {
      const { container } = renderRuler({ duration: 10 });
      const labels = Array.from(
        container.querySelectorAll(`.${styles.tick}`),
      ).map((el) => el.textContent);
      // 0s through 10s inclusive.
      expect(labels).toEqual([
        "0s",
        "1s",
        "2s",
        "3s",
        "4s",
        "5s",
        "6s",
        "7s",
        "8s",
        "9s",
        "10s",
      ]);
    });

    it("uses 0.5s intervals when the view is between 1s and 3s", () => {
      const { container } = renderRuler({
        duration: 3,
        viewStart: 0,
        viewEnd: 3,
      });
      const labels = Array.from(
        container.querySelectorAll(`.${styles.tick}`),
      ).map((el) => el.textContent);
      expect(labels).toEqual(["0s", "0.5s", "1s", "1.5s", "2s", "2.5s", "3s"]);
    });

    it("uses 0.1s intervals when the view collapses to <= 1s", () => {
      const { container } = renderRuler({
        duration: 5,
        viewStart: 1,
        viewEnd: 2,
      });
      const labels = Array.from(
        container.querySelectorAll(`.${styles.tick}`),
      ).map((el) => el.textContent);
      expect(labels[0]).toBe("1s");
      expect(labels[labels.length - 1]).toBe("2s");
      // 11 ticks across a 1s window at 0.1s spacing.
      expect(labels).toHaveLength(11);
    });

    it("positions each tick using its fraction of the view duration", () => {
      const { container } = renderRuler({ duration: 10 });
      const ticks = container.querySelectorAll<HTMLElement>(`.${styles.tick}`);
      // First tick at 0s sits at 0%, last at 10s sits at 100%.
      expect(inlineStyle(ticks[0])).toContain("left: 0%");
      expect(inlineStyle(ticks[ticks.length - 1])).toContain("left: 100%");
    });

    it("widens the interval on long files so ticks stay uncramped", () => {
      // A 60s file zoomed all the way out used to render one label per second
      // (61 ticks). It now scales up to a nicer interval.
      const { container } = renderRuler({
        duration: 60,
        viewStart: 0,
        viewEnd: 60,
      });
      const ticks = container.querySelectorAll(`.${styles.tick}`);
      // 10s spacing → 7 ticks (0..60), well under the old crush.
      expect(ticks).toHaveLength(7);
    });

    it("keeps a bounded tick count regardless of duration", () => {
      const { container } = renderRuler({
        duration: 300,
        viewStart: 0,
        viewEnd: 300,
      });
      const ticks = container.querySelectorAll(`.${styles.tick}`);
      // 30s spacing → 11 ticks (0..300), never hundreds.
      expect(ticks.length).toBeLessThanOrEqual(12);
    });

    it("labels ticks past a minute as m:ss", () => {
      const { container } = renderRuler({
        duration: 120,
        viewStart: 0,
        viewEnd: 120,
      });
      const labels = Array.from(
        container.querySelectorAll(`.${styles.tick}`),
      ).map((el) => el.textContent);
      // Sub-minute ticks stay in seconds; minute+ ticks read as m:ss.
      expect(labels).toContain("30s");
      expect(labels).toContain("1:00");
      expect(labels).toContain("1:30");
      expect(labels).toContain("2:00");
    });
  });

  describe("mode-aware ticks", () => {
    it("labels sequence-mode ticks as frame numbers, spaced on frame boundaries", () => {
      const { container } = renderRuler({
        duration: 1,
        viewStart: 0,
        viewEnd: 1,
        mode: { kind: "sequence", fps: 10 },
      });
      const labels = Array.from(
        container.querySelectorAll(`.${styles.tick}`),
      ).map((el) => el.textContent);
      // 1s at 10fps = frames 0..10, one tick per frame (smallest interval).
      expect(labels).toEqual([
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
      ]);
    });

    it("labels absolute-mode ticks as HH:MM:SS.mmm wall-clock time", () => {
      const { container } = renderRuler({
        duration: 2,
        viewStart: 0,
        viewEnd: 2,
        // 1970-01-01T00:00:10.000Z
        mode: { kind: "absolute", epochAnchorMs: 10_000 },
      });
      const labels = Array.from(
        container.querySelectorAll(`.${styles.tick}`),
      ).map((el) => el.textContent);
      expect(labels[0]).toBe("00:00:10.000");
      expect(labels[labels.length - 1]).toBe("00:00:12.000");
    });

    it("caps the tick count instead of hanging on a corrupt/huge duration", () => {
      // A mismeasured scene (e.g. streams disagreeing on epoch vs. elapsed
      // time) can blow the duration out to years; the ruler must degrade
      // gracefully rather than render millions of ticks.
      const { container } = renderRuler({
        duration: 1_600_000_000,
        viewStart: 0,
        viewEnd: 1_600_000_000,
        mode: { kind: "sequence", fps: 12 },
      });
      const ticks = container.querySelectorAll(`.${styles.tick}`);
      expect(ticks.length).toBeLessThanOrEqual(500);
    });
  });

  describe("playhead positioning", () => {
    it("translates the playhead group by the playhead's view fraction", () => {
      const { container } = renderRuler({ duration: 10, seekTo: 2.5 });
      const group = container.querySelector(`.${styles.playheadGroup}`);
      expect(inlineStyle(group!)).toContain("translate3d(25%");
    });

    it("anchors at 0% before any seek", () => {
      const { container } = renderRuler();
      const group = container.querySelector(`.${styles.playheadGroup}`);
      expect(inlineStyle(group!)).toContain("translate3d(0%");
    });

    it("computes the ratio relative to the active view window", () => {
      // View [4, 8], seek 5 → 25%.
      const { container } = renderRuler({
        duration: 10,
        seekTo: 5,
        viewStart: 4,
        viewEnd: 8,
      });
      const group = container.querySelector(`.${styles.playheadGroup}`);
      expect(inlineStyle(group!)).toContain("translate3d(25%");
    });
  });

  describe("loop handles", () => {
    // Positioning uses CSS calc() strings (`laneLeftCalc`). JSDOM strips them
    // from the inline style attribute, so these tests only verify that both
    // handles render — the calc math is covered indirectly by the (similar)
    // LoopOverlays.test.tsx assertions and should be unit-tested on
    // `utils/timeline-utils.ts::laneLeftCalc` if you want belt-and-suspenders.

    it("always renders both loop handles (start + end)", () => {
      const { container } = renderRuler({ duration: 10 });
      const handles = container.querySelectorAll<HTMLElement>(
        `.${styles.loopHandle}`,
      );
      expect(handles).toHaveLength(2);
    });

    it("re-renders the handles after the loop bounds change", () => {
      const { container } = renderRuler({
        duration: 10,
        defaultLoopStart: 2,
        defaultLoopEnd: 7,
      });
      // Two handles still present; their exact x is JSDOM-opaque.
      expect(container.querySelectorAll(`.${styles.loopHandle}`)).toHaveLength(
        2,
      );
    });
  });

  describe("default cursor", () => {
    it("has no cursor style when no drag is active", () => {
      const { container } = renderRuler();
      const ruler = container.querySelector(`.${styles.ruler}`);
      // cursor is set conditionally; when undefined, React strips the property
      // so the inline style won't contain "cursor:".
      expect(inlineStyle(ruler!)).not.toContain("cursor:");
    });
  });

  describe("wheel zoom (ctrl+wheel)", () => {
    it("zooms in when the wheel scrolls up with ctrlKey held", () => {
      renderRulerWithZoomRef({ duration: 10 });
      const before = screen.getByTestId("view").textContent;
      expect(before).toBe("0.000 / 10.000");

      const host = screen.getByTestId("zoom-host");
      fireEvent.wheel(host, { deltaY: -100, ctrlKey: true, clientX: 500 });
      // deltaY < 0 → factor 1/1.15 → newDuration ≈ 8.696 (shrinks).
      const after = screen.getByTestId("view").textContent!;
      const [vs, ve] = after.split(" / ").map(parseFloat);
      expect(ve - vs).toBeLessThan(10);
      expect(ve - vs).toBeGreaterThan(8);
    });

    it("zooms out when the wheel scrolls down with ctrlKey held", () => {
      renderRulerWithZoomRef({
        duration: 10,
        viewStart: 4,
        viewEnd: 6,
      });
      const before = screen.getByTestId("view").textContent;
      expect(before).toBe("4.000 / 6.000");

      const host = screen.getByTestId("zoom-host");
      fireEvent.wheel(host, { deltaY: 100, ctrlKey: true, clientX: 500 });
      // Zoom-out widens the visible window.
      const after = screen.getByTestId("view").textContent!;
      const [vs, ve] = after.split(" / ").map(parseFloat);
      expect(ve - vs).toBeGreaterThan(2);
    });
  });

  describe("wheel pan", () => {
    it("pans right when the wheel deltaX is positive", () => {
      renderRulerWithZoomRef({
        duration: 10,
        viewStart: 0,
        viewEnd: 4,
      });
      const before = screen.getByTestId("view").textContent;
      expect(before).toBe("0.000 / 4.000");

      const host = screen.getByTestId("zoom-host");
      fireEvent.wheel(host, { deltaX: 250, deltaY: 0 });
      // 250px of 1000 lane-width → 25% of viewDuration (4s) = 1s shift.
      const after = screen.getByTestId("view").textContent!;
      const [vs, ve] = after.split(" / ").map(parseFloat);
      expect(vs).toBeCloseTo(1, 2);
      expect(ve).toBeCloseTo(5, 2);
    });

    it("clamps pan so the view cannot scroll past duration", () => {
      renderRulerWithZoomRef({
        duration: 10,
        viewStart: 6,
        viewEnd: 10,
      });
      const host = screen.getByTestId("zoom-host");
      fireEvent.wheel(host, { deltaX: 10000, deltaY: 0 });
      const after = screen.getByTestId("view").textContent!;
      const [vs, ve] = after.split(" / ").map(parseFloat);
      // Clamped at the right edge.
      expect(ve).toBeCloseTo(10, 2);
      expect(vs).toBeCloseTo(6, 2);
    });
  });
  describe("hover caret", () => {
    // jsdom's PointerEvent lacks coordinate support; a MouseEvent with a
    // pointer event type carries clientX and still triggers React's
    // onPointerMove handler.
    const pointerMoveAt = (el: Element, clientX: number) => {
      fireEvent(el, new MouseEvent("pointermove", { bubbles: true, clientX }));
    };

    it("publishes the hovered time and renders the shared caret", () => {
      renderRuler({ duration: 10 });
      const ruler = screen.getByTestId("timeline-ruler");

      pointerMoveAt(ruler, 250);

      expect(screen.getByTestId("hover").textContent).toBe("2.500");
      expect(screen.getByTestId("timeline-hover-caret")).toBeTruthy();
    });

    it("respects the label column when mapping pointer x to time", () => {
      renderRuler({ duration: 10, labelWidth: 200 });
      const ruler = screen.getByTestId("timeline-ruler");

      // 200px label column, 800px lane: x=600 is halfway through the lane.
      pointerMoveAt(ruler, 600);

      expect(screen.getByTestId("hover").textContent).toBe("5.000");
    });

    it("clears hover state and the caret on pointer leave", () => {
      renderRuler({ duration: 10 });
      const ruler = screen.getByTestId("timeline-ruler");

      pointerMoveAt(ruler, 250);
      fireEvent.pointerLeave(ruler);

      expect(screen.getByTestId("hover").textContent).toBe("none");
      expect(screen.queryByTestId("timeline-hover-caret")).toBeNull();
    });

    it("renders a caret for hover published by another surface", () => {
      // Publishes without touching the ruler, the way a plot panel does.
      function ExternalHover({ time }: { time: number }) {
        const store = usePlaybackStore();
        useEffect(() => {
          setHoverTime(store, time);
        }, [store, time]);
        return null;
      }
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineRuler />
          <ExternalHover time={7.5} />
        </PlaybackProvider>,
      );

      expect(screen.getByTestId("timeline-hover-caret")).toBeTruthy();
    });
  });
});
