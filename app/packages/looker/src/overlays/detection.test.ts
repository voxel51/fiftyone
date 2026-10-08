/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";

import { CONTAINS } from "./base";
import DetectionOverlay, {
  DetectionLabel,
  getDetectionPoints,
} from "./detection";

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

const drawState = (thumbnail: boolean, selectedLabels: string[] = []) =>
  ({
    canvasBBox: [0, 0, 100, 100],
    config: { thumbnail },
    dashLength: 4,
    fontSize: 12,
    options: {
      alpha: 0.7,
      labelSelectionStyle: {},
      selectedLabels,
      selectedLabelTypes: {},
    },
    strokeWidth: 2,
    textPad: 2,
  }) as never;

const mockContext = () =>
  ({
    beginPath: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    moveTo: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
  }) as unknown as CanvasRenderingContext2D & {
    stroke: ReturnType<typeof vi.fn>;
    fillText: ReturnType<typeof vi.fn>;
  };

const makeOverlay = (label: Partial<DetectionLabel>) => {
  const overlay = new DetectionOverlay("detections", {
    id: "detection",
    label: "car",
    tags: [],
    ...label,
  } as DetectionLabel);
  vi.spyOn(overlay, "getColor").mockReturnValue("#ff0000");
  return overlay;
};

describe("a detection without a bounding box", () => {
  it.each([
    ["grid tile", true],
    ["modal", false],
  ])("draws nothing in a %s and does not throw", (_, thumbnail) => {
    const ctx = mockContext();
    const overlay = makeOverlay({});

    expect(() => overlay.draw(ctx, drawState(thumbnail))).not.toThrow();
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it("draws nothing when selected", () => {
    const ctx = mockContext();
    const overlay = makeOverlay({});

    expect(() =>
      overlay.draw(ctx, drawState(false, ["detection"])),
    ).not.toThrow();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("has no points", () => {
    expect(makeOverlay({}).getPoints()).toEqual([]);
    expect(
      getDetectionPoints([
        { bounding_box: [0.25, 0.25, 0.5, 0.5] } as DetectionLabel,
        {} as DetectionLabel,
      ]),
    ).toEqual([
      [0.25, 0.25],
      [0.75, 0.25],
      [0.75, 0.75],
      [0.25, 0.75],
    ]);
  });
});

describe("a projected 3D cuboid", () => {
  const convexHull: [number, number][] = [
    [0.1, 0.1],
    [0.5, 0.1],
    [0.5, 0.5],
  ];

  it("strokes its convex hull and no header", () => {
    const ctx = mockContext();
    const overlay = makeOverlay({ convexHull });

    expect(() => overlay.draw(ctx, drawState(false))).not.toThrow();
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it("does not throw when selected", () => {
    const ctx = mockContext();
    const overlay = makeOverlay({ convexHull });

    expect(() =>
      overlay.draw(ctx, drawState(true, ["detection"])),
    ).not.toThrow();
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });
});

describe("a 2D detection", () => {
  it("strokes its box and draws its header in the modal", () => {
    const ctx = mockContext();
    const overlay = makeOverlay({ bounding_box: [0.1, 0.1, 0.2, 0.2] });

    overlay.draw(ctx, drawState(false));
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).toHaveBeenCalledWith(
      "car",
      expect.any(Number),
      expect.any(Number),
    );
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
