import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CUBOID_RESIZE_FACES } from "../../annotation/cuboid-face-resize";
import {
  getBoxSurfaceDistanceAlong,
  getHeadingFaceAnchor,
  getHeadingFaceDotRadius,
  getHeadingFaceDots,
  getHeadingGhostArrowGeometry,
  pickNearestHeadingFace,
  type ProjectedHeadingFaceDot,
} from "./heading-arrow-geometry";

const DIMENSIONS: THREE.Vector3Tuple = [4, 2, 6];

describe("getBoxSurfaceDistanceAlong", () => {
  it("returns the half-extent along an axis-aligned direction", () => {
    expect(
      getBoxSurfaceDistanceAlong(DIMENSIONS, new THREE.Vector3(1, 0, 0)),
    ).toBeCloseTo(2, 6);
    expect(
      getBoxSurfaceDistanceAlong(DIMENSIONS, new THREE.Vector3(0, -1, 0)),
    ).toBeCloseTo(1, 6);
    expect(
      getBoxSurfaceDistanceAlong(DIMENSIONS, new THREE.Vector3(0, 0, 1)),
    ).toBeCloseTo(3, 6);
  });

  it("exits through the nearest face for a diagonal direction", () => {
    // Along (1,1,0) normalized, y (half-extent 1) is hit before x (2).
    const d = new THREE.Vector3(1, 1, 0).normalize();
    const distance = getBoxSurfaceDistanceAlong(DIMENSIONS, d);
    const point = d.clone().multiplyScalar(distance);

    expect(Math.abs(point.y)).toBeCloseTo(1, 6);
    expect(Math.abs(point.x)).toBeLessThanOrEqual(2 + 1e-6);
  });

  it("returns 0 for a zero direction", () => {
    expect(
      getBoxSurfaceDistanceAlong(DIMENSIONS, new THREE.Vector3()),
    ).toBeCloseTo(0, 6);
  });
});

describe("getHeadingGhostArrowGeometry", () => {
  it("returns null for a degenerate direction", () => {
    expect(
      getHeadingGhostArrowGeometry(DIMENSIONS, new THREE.Vector3()),
    ).toBeNull();
  });

  it("starts at the box center", () => {
    const geometry = getHeadingGhostArrowGeometry(
      DIMENSIONS,
      new THREE.Vector3(1, 0, 0),
    );
    expect(geometry?.shaftStart).toEqual([0, 0, 0]);
  });

  it("points along the requested direction and clears the surface", () => {
    const direction = new THREE.Vector3(0, 1, 0);
    const geometry = getHeadingGhostArrowGeometry(DIMENSIONS, direction);

    expect(geometry).not.toBeNull();
    if (!geometry) return;

    const shaftEnd = new THREE.Vector3(...geometry.shaftEnd);
    // Colinear with the direction...
    expect(shaftEnd.clone().normalize().dot(direction)).toBeCloseTo(1, 6);
    // ...and past the +y surface at half-extent 1.
    expect(shaftEnd.length()).toBeGreaterThan(1);
  });

  it("puts the tip beyond the shaft end, still along the direction", () => {
    const direction = new THREE.Vector3(0, 0, -1);
    const geometry = getHeadingGhostArrowGeometry(DIMENSIONS, direction);

    expect(geometry).not.toBeNull();
    if (!geometry) return;

    const shaftEnd = new THREE.Vector3(...geometry.shaftEnd);
    const tip = shaftEnd
      .clone()
      .addScaledVector(geometry.direction, geometry.headLength);

    expect(tip.length()).toBeGreaterThan(shaftEnd.length());
    expect(tip.clone().normalize().dot(direction)).toBeCloseTo(1, 6);
  });

  it("builds a non-degenerate cone pointing along the requested direction", () => {
    for (const direction of [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 1, 1).normalize(),
      new THREE.Vector3(-2, 0.5, 1).normalize(),
    ]) {
      const geometry = getHeadingGhostArrowGeometry(DIMENSIONS, direction);
      expect(geometry).not.toBeNull();
      if (!geometry) continue;

      expect(geometry.headLength).toBeGreaterThan(0);
      expect(geometry.headRadius).toBeGreaterThan(0);
      // A cone has no preferred plane — unlike the flat triangle this
      // replaced, it stays visible regardless of which axis it leans on.
      expect(geometry.direction.length()).toBeCloseTo(1, 6);
      expect(geometry.direction.dot(direction)).toBeCloseTo(1, 6);
    }
  });
});

describe("getHeadingGhostArrowGeometry with a surface anchor", () => {
  it("starts at the supplied origin instead of the center", () => {
    const origin = new THREE.Vector3(2, 0, -3);
    const geometry = getHeadingGhostArrowGeometry(
      DIMENSIONS,
      new THREE.Vector3(1, 0, 0),
      origin,
    );

    expect(geometry?.shaftStart).toEqual([2, 0, -3]);
  });

  it("extends outward from the origin, never back through the box", () => {
    const anchor = getHeadingFaceAnchor(DIMENSIONS, "+z");
    expect(anchor).not.toBeNull();
    if (!anchor) return;
    const origin = anchor.point;

    const direction = new THREE.Vector3(0, 0, 1);
    const geometry = getHeadingGhostArrowGeometry(
      DIMENSIONS,
      direction,
      origin,
    );
    expect(geometry).not.toBeNull();
    if (!geometry) return;

    const shaftEnd = new THREE.Vector3(...geometry.shaftEnd);
    const tip = shaftEnd
      .clone()
      .addScaledVector(geometry.direction, geometry.headLength);

    // Both past the top face, and strictly further out than the anchor.
    expect(shaftEnd.z).toBeGreaterThan(origin.z);
    expect(tip.z).toBeGreaterThan(shaftEnd.z);
    // The anchor stays on the face, so the shaft doesn't cross the body.
    expect(origin.z).toBeCloseTo(3, 6);
  });
});

describe("getHeadingFaceDots", () => {
  it("returns one dot per face", () => {
    const dots = getHeadingFaceDots(DIMENSIONS);
    expect(dots).toHaveLength(CUBOID_RESIZE_FACES.length);
    expect(dots.map((d) => d.face).sort()).toEqual(
      [...CUBOID_RESIZE_FACES].sort(),
    );
  });

  it("places each dot at its face center", () => {
    const byFace = Object.fromEntries(
      getHeadingFaceDots(DIMENSIONS).map((d) => [d.face, d.position]),
    );

    expect(byFace["+x"]).toEqual([2, 0, 0]);
    expect(byFace["-x"]).toEqual([-2, 0, 0]);
    expect(byFace["+y"]).toEqual([0, 1, 0]);
    expect(byFace["-y"]).toEqual([0, -1, 0]);
    expect(byFace["+z"]).toEqual([0, 0, 3]);
    expect(byFace["-z"]).toEqual([0, 0, -3]);
  });
});

describe("getHeadingFaceDotRadius", () => {
  it("scales with the smallest extent", () => {
    expect(getHeadingFaceDotRadius([4, 2, 6])).toBeGreaterThan(
      getHeadingFaceDotRadius([1, 0.5, 1]),
    );
  });

  it("stays positive for a degenerate box", () => {
    expect(getHeadingFaceDotRadius([0, 0, 0])).toBeGreaterThan(0);
  });

  it("caps the radius on a thin box instead of exceeding its smallest extent", () => {
    expect(getHeadingFaceDotRadius([4, 0.05, 6])).toBeLessThanOrEqual(
      0.05 * 0.2,
    );
  });

  it("is zero for a partially degenerate box (a real face with zero area)", () => {
    expect(getHeadingFaceDotRadius([4, 0, 6])).toBe(0);
  });
});

describe("getHeadingFaceAnchor", () => {
  it("anchors at the face center with the outward normal", () => {
    const anchor = getHeadingFaceAnchor(DIMENSIONS, "+z");
    expect(anchor?.point.toArray()).toEqual([0, 0, 3]);
    expect(anchor?.normal.toArray()).toEqual([0, 0, 1]);
  });

  it("flips the normal and center for the opposite face", () => {
    const anchor = getHeadingFaceAnchor(DIMENSIONS, "-y");
    expect(anchor?.point.toArray()).toEqual([0, -1, 0]);
    expect(anchor?.normal.toArray()).toEqual([0, -1, 0]);
  });

  it("puts every anchor on its own face plane, off-center in no other axis", () => {
    for (const face of CUBOID_RESIZE_FACES) {
      const anchor = getHeadingFaceAnchor(DIMENSIONS, face);
      expect(anchor).not.toBeNull();
      if (!anchor) continue;

      // Exactly one non-zero component: the face normal's axis.
      const nonZero = anchor.point
        .toArray()
        .filter((component) => Math.abs(component) > 1e-9);
      expect(nonZero).toHaveLength(1);
      // The anchor lies along the normal, at the half-extent.
      expect(anchor.point.clone().normalize().dot(anchor.normal)).toBeCloseTo(
        1,
        6,
      );
    }
  });

  it("returns null when the face has no extent", () => {
    expect(getHeadingFaceAnchor([4, 0, 6], "+y")).toBeNull();
  });
});

describe("pickNearestHeadingFace", () => {
  const dot = (
    face: ProjectedHeadingFaceDot["face"],
    x: number,
    y: number,
    cameraDistance = 10,
  ): ProjectedHeadingFaceDot => ({ face, x, y, cameraDistance });

  it("returns null with nothing to pick from", () => {
    expect(pickNearestHeadingFace([], { x: 0, y: 0 })).toBeNull();
  });

  it("picks the dot nearest the cursor on screen", () => {
    const projected = [
      dot("+x", 0.5, 0),
      dot("-x", -0.5, 0),
      dot("+y", 0, 0.5),
      dot("-y", 0, -0.5),
    ];

    expect(pickNearestHeadingFace(projected, { x: 0.45, y: 0.02 })).toBe("+x");
    expect(pickNearestHeadingFace(projected, { x: -0.4, y: 0 })).toBe("-x");
    expect(pickNearestHeadingFace(projected, { x: 0, y: -0.6 })).toBe("-y");
  });

  it("prefers the camera-facing dot when two overlap on screen", () => {
    // The near and far faces along the view axis project to the same point.
    const projected = [
      dot("+z", 0, 0, /* nearer */ 5),
      dot("-z", 0, 0, /* farther */ 15),
    ];

    expect(pickNearestHeadingFace(projected, { x: 0, y: 0 })).toBe("+z");
    // Order must not matter.
    expect(
      pickNearestHeadingFace([...projected].reverse(), { x: 0, y: 0 }),
    ).toBe("+z");
  });

  it("still prefers a clearly nearer dot over a camera-facing far one", () => {
    // Outside the overlap threshold, screen distance wins outright even though
    // the loser is closer to the camera.
    const projected = [
      dot("+z", 0.9, 0.9, /* nearest to camera */ 1),
      dot("+x", 0, 0, 20),
    ];

    expect(pickNearestHeadingFace(projected, { x: 0, y: 0 })).toBe("+x");
  });

  it("treats dots within the overlap threshold as a tie", () => {
    const projected = [dot("+x", 0, 0, 20), dot("-x", 0.01, 0, 5)];

    // -x is marginally farther from the cursor but well inside the threshold,
    // and nearer the camera, so it wins.
    expect(pickNearestHeadingFace(projected, { x: 0, y: 0 }, 0.04)).toBe("-x");
    // With no tolerance, raw screen distance decides instead.
    expect(pickNearestHeadingFace(projected, { x: 0, y: 0 }, 0)).toBe("+x");
  });
});

describe("ghost arrow length normalization", () => {
  const lengthOf = (
    dimensions: THREE.Vector3Tuple,
    face: Parameters<typeof getHeadingFaceAnchor>[1],
  ) => {
    const anchor = getHeadingFaceAnchor(dimensions, face);
    if (!anchor) return null;
    const geometry = getHeadingGhostArrowGeometry(
      dimensions,
      anchor.normal,
      anchor.point,
    );
    if (!geometry) return null;
    const shaftEnd = new THREE.Vector3(...geometry.shaftEnd);
    const tip = shaftEnd
      .clone()
      .addScaledVector(geometry.direction, geometry.headLength);
    return tip.distanceTo(new THREE.Vector3(...geometry.shaftStart));
  };

  it("is the same length on every face", () => {
    // Previously the ghost sized off the extent it pointed along, so it changed
    // length as it hopped between faces of a non-cubic box.
    const lengths = CUBOID_RESIZE_FACES.map((face) =>
      lengthOf(DIMENSIONS, face),
    );

    for (const length of lengths) {
      expect(length).not.toBeNull();
      expect(length).toBeCloseTo(lengths[0] as number, 6);
    }
  });

  it("does not grow when the heading axis gets longer", () => {
    expect(lengthOf([40, 2, 6], "+x")).toBeCloseTo(
      lengthOf([4, 2, 6], "+x") as number,
      6,
    );
  });
});
