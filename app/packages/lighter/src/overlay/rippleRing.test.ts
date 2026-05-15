/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";
import {
  KEYPOINT_RADIUS,
  RIPPLE_CYCLE_MS,
  RIPPLE_LINE_WIDTH,
  RIPPLE_MAX_RADIUS,
  RIPPLE_PEAK_OPACITY,
  RIPPLE_RING_COUNT,
} from "../constants";
import type { Renderer2D } from "../renderer/Renderer2D";
import { drawRippleRings } from "./rippleRing";

const makeRenderer = () => {
  const drawPoint = vi.fn();
  return {
    renderer: { drawPoint } as unknown as Renderer2D,
    drawPoint,
  };
};

const CENTER = { x: 50, y: 50 };
const COLOR = "#abcdef";
const CONTAINER = "container-id";

const call = (elapsedMs: number) => {
  const { renderer, drawPoint } = makeRenderer();
  drawRippleRings({
    renderer,
    center: CENTER,
    color: COLOR,
    elapsedMs,
    containerId: CONTAINER,
  });
  return drawPoint.mock.calls;
};

describe("drawRippleRings", () => {
  it("draws each ring at the same center, with the requested color, line width, and container", () => {
    // Mid-cycle so both rings have non-trivial opacity and are visible.
    const calls = call(RIPPLE_CYCLE_MS / 4);
    expect(calls.length).toBeGreaterThan(0);

    for (const c of calls) {
      const [point, _radius, style, container] = c;
      expect(point).toEqual(CENTER);
      expect(style.strokeStyle).toBe(COLOR);
      expect(style.lineWidth).toBe(RIPPLE_LINE_WIDTH);
      expect(container).toBe(CONTAINER);
    }
  });

  it("at t=0 the lead ring sits at the base radius with peak opacity (just barely visible after threshold)", () => {
    const calls = call(0);
    // At t=0, the lead ring has ringProgress=0 → eased=0 → opacity=peak, radius=KEYPOINT_RADIUS.
    // The trailing ring has ringProgress=0.5 → eased=1-(1-0.5)^3=0.875 → opacity=(1-0.875)*peak.
    // Find the call that should be the lead ring.
    const lead = calls.find((c) => (c[1] as number) === KEYPOINT_RADIUS);
    expect(lead).toBeDefined();
    const [, , leadStyle] = lead!;
    expect(leadStyle.opacity).toBeCloseTo(RIPPLE_PEAK_OPACITY, 5);
  });

  it("skips rings whose opacity has decayed below the 0.01 culling threshold", () => {
    // Just shy of full cycle — lead ring's eased is ~1, opacity ~0.
    const epsilonMs = 1; // 1ms before cycle end
    const callsNearEnd = call(RIPPLE_CYCLE_MS - epsilonMs);

    // At least one ring should be culled vs. the maximum of RIPPLE_RING_COUNT.
    expect(callsNearEnd.length).toBeLessThanOrEqual(RIPPLE_RING_COUNT);

    // Every drawn ring must clear the threshold.
    for (const c of callsNearEnd) {
      expect((c[2] as { opacity: number }).opacity).toBeGreaterThan(0.01);
    }
  });

  it("radius grows monotonically with elapsed time within a single ring's life", () => {
    // Sample the lead ring's radius at t=0, t=cycle/4, t=cycle/2 — should grow.
    const r0 = call(0).find((c) => (c[1] as number) === KEYPOINT_RADIUS)?.[1];
    const r1 = call(RIPPLE_CYCLE_MS / 4)[0][1];
    const r2 = call(RIPPLE_CYCLE_MS / 2)[0][1];

    expect(r0).toBe(KEYPOINT_RADIUS);
    expect(r1 as number).toBeGreaterThan(r0 as number);
    expect(r2 as number).toBeGreaterThan(r1 as number);
    // Stays bounded by base + max.
    expect(r2 as number).toBeLessThanOrEqual(KEYPOINT_RADIUS + RIPPLE_MAX_RADIUS);
  });

  it("opacity decays monotonically as a ring ages within its life", () => {
    const o0 = (call(0).find((c) => (c[1] as number) === KEYPOINT_RADIUS)?.[2] as {
      opacity: number;
    }).opacity;
    const o1 = (call(RIPPLE_CYCLE_MS / 4)[0][2] as { opacity: number }).opacity;
    const o2 = (call(RIPPLE_CYCLE_MS / 2)[0][2] as { opacity: number }).opacity;

    expect(o0).toBeGreaterThan(o1);
    expect(o1).toBeGreaterThan(o2);
  });

  it("is cyclic — elapsedMs and elapsedMs + RIPPLE_CYCLE_MS produce the same draw calls", () => {
    const a = call(RIPPLE_CYCLE_MS / 3);
    const b = call(RIPPLE_CYCLE_MS / 3 + RIPPLE_CYCLE_MS);
    expect(b).toEqual(a);
  });

  it("staggers rings by 1/RIPPLE_RING_COUNT of the cycle", () => {
    // Sample one cycle of the lead ring's first radius at t=0:
    const t0 = call(0);
    // Sample at t = cycle/RIPPLE_RING_COUNT — the trailing ring should now be
    // at the lead position (radius = KEYPOINT_RADIUS) since it has rolled over.
    const tStagger = call(RIPPLE_CYCLE_MS / RIPPLE_RING_COUNT);
    expect(
      tStagger.find((c) => (c[1] as number) === KEYPOINT_RADIUS)
    ).toBeDefined();
    expect(t0.find((c) => (c[1] as number) === KEYPOINT_RADIUS)).toBeDefined();
  });
});
