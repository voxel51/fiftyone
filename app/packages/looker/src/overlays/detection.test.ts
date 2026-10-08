/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";

import { CONTAINS } from "./base";
import DetectionOverlay, { DetectionLabel } from "./detection";

describe("a 3D detection has no 2D box to hit-test", () => {
  const overlay = new DetectionOverlay("detections", {
    id: "cuboid",
    label: "car",
    location: [0, 0, 0],
    dimensions: [1, 1, 1],
    rotation: [0, 0, 0],
  } as DetectionLabel);
  const state = {
    pixelCoordinates: [0, 0],
    dimensions: [10, 10],
    strokeWidth: 1,
    canvasBBox: [0, 0, 10, 10],
  } as never;

  it("is never under the cursor", () => {
    expect(overlay.containsPoint(state)).toBe(CONTAINS.NONE);
  });

  it("is infinitely far from the cursor", () => {
    expect(overlay.getMouseDistance(state)).toBe(Infinity);
  });
});

describe("drawing a detection", () => {
  const makeOverlay = () => {
    const overlay = new DetectionOverlay("detections", {
      _cls: "Detection",
      id: "box",
      label: "car",
      tags: [],
      bounding_box: [0.2, 0.2, 0.4, 0.4],
    } as DetectionLabel);
    vi.spyOn(overlay, "getColor").mockReturnValue("#ffffff");
    return overlay;
  };

  const makeContext = () => ({
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn(() => ({ width: 40 })),
    moveTo: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
  });

  // 100x100px canvas: the box spans 20..60px on each axis, centered at 40px
  const makeState = ({
    hidden = false,
    selected = false,
  }: { hidden?: boolean; selected?: boolean } = {}) =>
    ({
      canvasBBox: [0, 0, 100, 100],
      config: { thumbnail: false },
      dashLength: 4,
      dimensions: [100, 100],
      fontSize: 10,
      options: {
        hiddenBoundingBoxes: hidden ? ["detections"] : [],
        labelSelectionStyle: {},
        selectedLabels: selected ? ["box"] : [],
        selectedLabelTypes: {},
        shownLabelAttributes: {},
      },
      strokeWidth: 2,
      textPad: 2,
    }) as never;

  it("paints the label over the box lines", () => {
    // selected: both the box stroke and the dashed outline come first
    const ctx = makeContext();
    makeOverlay().draw(ctx as never, makeState({ selected: true }));

    const strokes = ctx.stroke.mock.invocationCallOrder;
    expect(strokes).toHaveLength(2);
    expect(ctx.fill.mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(...strokes),
    );
  });

  it("strokes the box while shown", () => {
    const ctx = makeContext();
    makeOverlay().draw(ctx as never, makeState());
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it("skips the box stroke while hidden", () => {
    const ctx = makeContext();
    makeOverlay().draw(ctx as never, makeState({ hidden: true }));
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("still dashes the box while selected", () => {
    const ctx = makeContext();
    makeOverlay().draw(
      ctx as never,
      makeState({ hidden: true, selected: true }),
    );
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.setLineDash).toHaveBeenCalledWith([4]);
  });

  it("anchors the label on the top-left corner while shown", () => {
    // header bottom-left at (20 - strokeWidth / 2, 20); text inset by
    // textPad + strokeWidth
    const ctx = makeContext();
    makeOverlay().draw(ctx as never, makeState());
    expect(ctx.fillText).toHaveBeenCalledWith("car", 23, 16);
  });

  it("centers the label while hidden", () => {
    // the 48x18px header (40px text + 8px padding) centered on (40, 40)
    // puts its bottom-left at (16, 49); text inset by textPad + strokeWidth
    const ctx = makeContext();
    makeOverlay().draw(ctx as never, makeState({ hidden: true }));
    expect(ctx.fillText).toHaveBeenCalledWith("car", 20, 45);
  });
});
