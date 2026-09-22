import { describe, expect, it } from "vitest";
import {
  getRotatedBoxCorners,
  getRotation2d,
  isPointInRotatedBox,
  lerpRotation,
  toRotatedBoxFrame,
} from "./rotated-box";

const DIMS: [number, number] = [1000, 500];

// centered box: center (0.5, 0.5), 200px wide, 100px tall in DIMS
const BOX: [number, number, number, number] = [0.4, 0.4, 0.2, 0.2];

describe("getRotation2d", () => {
  it("returns finite numbers as-is", () => {
    expect(getRotation2d(1.5)).toBe(1.5);
    expect(getRotation2d(0)).toBe(0);
    expect(getRotation2d(-0.25)).toBe(-0.25);
  });

  it("returns 0 for absent or non-scalar values", () => {
    expect(getRotation2d(undefined)).toBe(0);
    expect(getRotation2d(null)).toBe(0);
    expect(getRotation2d([0, -1.56, 0])).toBe(0);
    expect(getRotation2d("1.5")).toBe(0);
    expect(getRotation2d(NaN)).toBe(0);
    expect(getRotation2d(Infinity)).toBe(0);
  });
});

describe("getRotatedBoxCorners", () => {
  it("returns the unrotated corners for rotation 0", () => {
    const corners = getRotatedBoxCorners(BOX, 0, DIMS);
    expect(corners[0][0]).toBeCloseTo(0.4);
    expect(corners[0][1]).toBeCloseTo(0.4);
    expect(corners[1][0]).toBeCloseTo(0.6);
    expect(corners[1][1]).toBeCloseTo(0.4);
    expect(corners[2][0]).toBeCloseTo(0.6);
    expect(corners[2][1]).toBeCloseTo(0.6);
    expect(corners[3][0]).toBeCloseTo(0.4);
    expect(corners[3][1]).toBeCloseTo(0.6);
  });

  it("rotates clockwise on screen for positive rotation", () => {
    // a quarter turn swaps the 200x100px box's extents in pixel space
    const corners = getRotatedBoxCorners(BOX, Math.PI / 2, DIMS);

    // top-left corner (-100, -50) px from center maps to (50, -100) px:
    // right of center and above it — clockwise in y-down coordinates
    expect(corners[0][0] * DIMS[0]).toBeCloseTo(550);
    expect(corners[0][1] * DIMS[1]).toBeCloseTo(150);
  });

  it("rotates in pixel space, not normalized space", () => {
    // on non-square media, a quarter turn makes the normalized extents
    // reflect the pixel aspect ratio: the 200px top edge becomes vertical
    const corners = getRotatedBoxCorners(BOX, Math.PI / 2, DIMS);
    const topEdgePx = Math.abs(corners[0][1] - corners[1][1]) * DIMS[1];
    expect(topEdgePx).toBeCloseTo(200);
  });

  it("returns to the original corners after a full turn", () => {
    const corners = getRotatedBoxCorners(BOX, 2 * Math.PI, DIMS);
    expect(corners[0][0]).toBeCloseTo(0.4);
    expect(corners[0][1]).toBeCloseTo(0.4);
  });
});

describe("isPointInRotatedBox", () => {
  it("matches the axis-aligned test for rotation 0", () => {
    expect(isPointInRotatedBox([500, 250], BOX, 0, DIMS)).toBe(true);
    expect(isPointInRotatedBox([401, 201], BOX, 0, DIMS)).toBe(true);
    expect(isPointInRotatedBox([399, 250], BOX, 0, DIMS)).toBe(false);
  });

  it("contains points that enter the box only under rotation", () => {
    // (500, 160) px is 90px above center: outside the unrotated box (50px
    // half-height), inside once the 100px half-width points vertically
    const point: [number, number] = [500, 160];
    expect(isPointInRotatedBox(point, BOX, 0, DIMS)).toBe(false);
    expect(isPointInRotatedBox(point, BOX, Math.PI / 2, DIMS)).toBe(true);
  });

  it("excludes former corners that leave the box under rotation", () => {
    // the unrotated top-left corner region exits the box when rotated 45deg:
    // (402, 202) is (-98, -48) from center; its local x under a 45deg turn
    // is (-98 - 48) / sqrt(2) = -103.2, past the 100px half-width
    const point: [number, number] = [402, 202];
    expect(isPointInRotatedBox(point, BOX, 0, DIMS)).toBe(true);
    expect(isPointInRotatedBox(point, BOX, Math.PI / 4, DIMS)).toBe(false);
  });

  it("expands the box by the given padding", () => {
    expect(isPointInRotatedBox([395, 250], BOX, 0, DIMS)).toBe(false);
    expect(isPointInRotatedBox([395, 250], BOX, 0, DIMS, 6)).toBe(true);
  });
});

describe("lerpRotation", () => {
  it("interpolates plainly when the arc does not wrap", () => {
    expect(lerpRotation(0.2, 0.6, 0.5)).toBeCloseTo(0.4);
    expect(lerpRotation(0.2, 0.6, 0)).toBeCloseTo(0.2);
    expect(lerpRotation(0.2, 0.6, 1)).toBeCloseTo(0.6);
  });

  it("takes the shortest arc through zero", () => {
    // 350° → 10° is a 20° turn through 0°, not 340° backwards
    const from = (350 * Math.PI) / 180;
    const to = (10 * Math.PI) / 180;
    const mid = lerpRotation(from, to, 0.5);
    expect((mid * 180) / Math.PI).toBeCloseTo(0);
  });

  it("takes the shortest arc in the negative direction", () => {
    // 10° → 350° turns -20° through 0°
    const from = (10 * Math.PI) / 180;
    const to = (350 * Math.PI) / 180;
    const mid = lerpRotation(from, to, 0.25);
    expect((mid * 180) / Math.PI).toBeCloseTo(5);
  });

  it("normalizes results into [0, 2*pi)", () => {
    const result = lerpRotation(
      (350 * Math.PI) / 180,
      (10 * Math.PI) / 180,
      0.25,
    );
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(2 * Math.PI);
    expect((result * 180) / Math.PI).toBeCloseTo(355);
  });
});

describe("toRotatedBoxFrame", () => {
  it("maps the center to the origin", () => {
    const [lx, ly] = toRotatedBoxFrame([500, 250], BOX, 1.23, DIMS);
    expect(lx).toBeCloseTo(0);
    expect(ly).toBeCloseTo(0);
  });

  it("inverts the corner transform", () => {
    const rotation = 0.7;
    const corners = getRotatedBoxCorners(BOX, rotation, DIMS);
    const cornerPx: [number, number] = [
      corners[2][0] * DIMS[0],
      corners[2][1] * DIMS[1],
    ];

    // the rotated bottom-right corner maps back to (+hw, +hh) locally
    const [lx, ly] = toRotatedBoxFrame(cornerPx, BOX, rotation, DIMS);
    expect(lx).toBeCloseTo(100);
    expect(ly).toBeCloseTo(50);
  });
});
