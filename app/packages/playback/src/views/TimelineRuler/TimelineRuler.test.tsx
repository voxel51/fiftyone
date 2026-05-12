import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackProvider, usePlayback } from "../../lib/playback/PlaybackProvider";
import {
  viewEndAtom,
  viewStartAtom,
} from "../../lib/playback/atoms";
import TimelineRuler from "./TimelineRuler";

// Renders the current view window to the DOM so tests can assert on
// post-action atom state without touching the store directly.
function ViewReadout() {
  const vs = useAtomValue(viewStartAtom);
  const ve = useAtomValue(viewEndAtom);
  return <span data-testid="view">{`${vs.toFixed(3)} / ${ve.toFixed(3)}`}</span>;
}

function Seeker({ time }: { time: number }) {
  const { seek } = usePlayback();
  useEffect(() => {
    seek(time);
  }, [seek, time]);
  return null;
}

function ViewSetter({ start, end }: { start: number; end: number }) {
  const { setView } = usePlayback();
  useEffect(() => {
    setView(start, end);
  }, [setView, start, end]);
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
  } = opts;
  return render(
    <PlaybackProvider
      duration={duration}
      stepInterval={1 / 30}
      defaultLoopStart={defaultLoopStart}
      defaultLoopEnd={defaultLoopEnd}
    >
      {viewStart !== undefined && viewEnd !== undefined ? (
        <ViewSetter start={viewStart} end={viewEnd} />
      ) : null}
      {seekTo !== undefined ? <Seeker time={seekTo} /> : null}
      <TimelineRuler labelWidth={labelWidth} />
      <ViewReadout />
    </PlaybackProvider>
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
    </PlaybackProvider>
  );
}

const inlineStyle = (el: Element): string => el.getAttribute("style") ?? "";

describe("TimelineRuler", () => {
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

  afterEach(() => cleanup());

  describe("structure", () => {
    it("renders the ruler, lane, loop handles, and playhead group", () => {
      const { container } = renderRuler();
      expect(container.querySelector(".ruler")).not.toBeNull();
      expect(container.querySelector(".lane")).not.toBeNull();
      expect(container.querySelectorAll(".loopHandle")).toHaveLength(2);
      expect(container.querySelector(".playheadGroup")).not.toBeNull();
      expect(container.querySelector(".playheadHandle")).not.toBeNull();
      expect(container.querySelector(".playheadTriangle")).not.toBeNull();
    });

    it("omits the labelSpacer when labelWidth is 0", () => {
      const { container } = renderRuler({ labelWidth: 0 });
      expect(container.querySelector(".labelSpacer")).toBeNull();
    });

    it("renders the labelSpacer with the requested width when labelWidth > 0", () => {
      const { container } = renderRuler({ labelWidth: 120 });
      const spacer = container.querySelector(".labelSpacer");
      expect(spacer).not.toBeNull();
      expect(inlineStyle(spacer!)).toContain("width: 120px");
    });

    it("offsets the playhead group by labelWidth", () => {
      const { container } = renderRuler({ labelWidth: 80 });
      const group = container.querySelector(".playheadGroup");
      expect(inlineStyle(group!)).toContain("left: 80px");
    });
  });

  describe("ticks", () => {
    it("uses 1s intervals when the view is wider than 3s", () => {
      const { container } = renderRuler({ duration: 10 });
      const labels = Array.from(container.querySelectorAll(".tick")).map(
        (el) => el.textContent
      );
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
      const labels = Array.from(container.querySelectorAll(".tick")).map(
        (el) => el.textContent
      );
      expect(labels).toEqual(["0s", "0.5s", "1s", "1.5s", "2s", "2.5s", "3s"]);
    });

    it("uses 0.1s intervals when the view collapses to <= 1s", () => {
      const { container } = renderRuler({
        duration: 5,
        viewStart: 1,
        viewEnd: 2,
      });
      const labels = Array.from(container.querySelectorAll(".tick")).map(
        (el) => el.textContent
      );
      expect(labels[0]).toBe("1s");
      expect(labels[labels.length - 1]).toBe("2s");
      // 11 ticks across a 1s window at 0.1s spacing.
      expect(labels).toHaveLength(11);
    });

    it("positions each tick using its fraction of the view duration", () => {
      const { container } = renderRuler({ duration: 10 });
      const ticks = container.querySelectorAll<HTMLElement>(".tick");
      // First tick at 0s sits at 0%, last at 10s sits at 100%.
      expect(inlineStyle(ticks[0])).toContain("left: 0%");
      expect(inlineStyle(ticks[ticks.length - 1])).toContain("left: 100%");
    });
  });

  describe("playhead positioning", () => {
    it("translates the playhead group by the playhead's view fraction", () => {
      const { container } = renderRuler({ duration: 10, seekTo: 2.5 });
      const group = container.querySelector(".playheadGroup");
      expect(inlineStyle(group!)).toContain("translate3d(25%");
    });

    it("anchors at 0% before any seek", () => {
      const { container } = renderRuler();
      const group = container.querySelector(".playheadGroup");
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
      const group = container.querySelector(".playheadGroup");
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
      const handles = container.querySelectorAll<HTMLElement>(".loopHandle");
      expect(handles).toHaveLength(2);
    });

    it("re-renders the handles after the loop bounds change", () => {
      const { container } = renderRuler({
        duration: 10,
        defaultLoopStart: 2,
        defaultLoopEnd: 7,
      });
      // Two handles still present; their exact x is JSDOM-opaque.
      expect(container.querySelectorAll(".loopHandle")).toHaveLength(2);
    });
  });

  describe("default cursor", () => {
    it("has no cursor style when no drag is active", () => {
      const { container } = renderRuler();
      const ruler = container.querySelector(".ruler");
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
});
