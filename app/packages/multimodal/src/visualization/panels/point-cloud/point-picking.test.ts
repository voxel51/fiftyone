import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  buildPointCloudRenderData,
  sourcePointIndexForRenderedIndex,
} from "./point-cloud-colors";
import {
  POINT_PICK_BLOCKING_USER_DATA,
  POINT_PICK_LAYER_ID_KEY,
  isPointPickBlocked,
  pointPickWorldThreshold,
  pointsLayerIdForObject,
  pointsVertexColor,
  pointsVertexWorldPosition,
  resolvePointPick,
} from "./point-picking";

describe("sourcePointIndexForRenderedIndex", () => {
  it("is the identity when nothing is sampled or dropped", () => {
    const positions = Float32Array.from([0, 0, 0, 1, 1, 1, 2, 2, 2]);

    expect(sourcePointIndexForRenderedIndex(positions, 100, 0)).toBe(0);
    expect(sourcePointIndexForRenderedIndex(positions, 100, 2)).toBe(2);
    expect(sourcePointIndexForRenderedIndex(positions, 100, 3)).toBeNull();
  });

  it("skips non-finite points exactly like the render walk", () => {
    const positions = Float32Array.from([
      0,
      0,
      0,
      Number.NaN,
      1,
      1,
      2,
      2,
      2,
      3,
      3,
      Number.POSITIVE_INFINITY,
      4,
      4,
      4,
    ]);

    expect(sourcePointIndexForRenderedIndex(positions, 100, 0)).toBe(0);
    expect(sourcePointIndexForRenderedIndex(positions, 100, 1)).toBe(2);
    expect(sourcePointIndexForRenderedIndex(positions, 100, 2)).toBe(4);
    expect(sourcePointIndexForRenderedIndex(positions, 100, 3)).toBeNull();
  });

  it("applies the uniform sampling stride", () => {
    const positions = new Float32Array(10 * 3);
    for (let index = 0; index < 10; index++) {
      positions[index * 3] = index;
    }

    // 10 points into a budget of 5 → stride 2 → sources 0, 2, 4, 6, 8.
    expect(sourcePointIndexForRenderedIndex(positions, 5, 0)).toBe(0);
    expect(sourcePointIndexForRenderedIndex(positions, 5, 3)).toBe(6);
    expect(sourcePointIndexForRenderedIndex(positions, 5, 5)).toBeNull();
  });

  it("stays in lockstep with buildPointCloudRenderData", () => {
    // Deterministic pseudo-random cloud with NaN holes, downsampled 3:1.
    const sourcePointCount = 300;
    const positions = new Float32Array(sourcePointCount * 3);
    for (let index = 0; index < sourcePointCount; index++) {
      const offset = index * 3;
      if (index % 17 === 3) {
        positions[offset + 1] = Number.NaN;
        continue;
      }
      positions[offset] = Math.sin(index) * 10;
      positions[offset + 1] = Math.cos(index * 3) * 10;
      positions[offset + 2] = (index % 29) - 14;
    }

    const maxRenderedPoints = 100;
    const data = buildPointCloudRenderData(positions, maxRenderedPoints, {});

    expect(data.renderedPointCount).toBeGreaterThan(0);
    for (
      let renderedIndex = 0;
      renderedIndex < data.renderedPointCount;
      renderedIndex++
    ) {
      const sourceIndex = sourcePointIndexForRenderedIndex(
        positions,
        maxRenderedPoints,
        renderedIndex,
      );
      expect(sourceIndex).not.toBeNull();
      expect(data.positions[renderedIndex * 3]).toBe(
        positions[(sourceIndex as number) * 3],
      );
      expect(data.positions[renderedIndex * 3 + 1]).toBe(
        positions[(sourceIndex as number) * 3 + 1],
      );
      expect(data.positions[renderedIndex * 3 + 2]).toBe(
        positions[(sourceIndex as number) * 3 + 2],
      );
    }
    expect(
      sourcePointIndexForRenderedIndex(
        positions,
        maxRenderedPoints,
        data.renderedPointCount,
      ),
    ).toBeNull();
    expect(sourcePointIndexForRenderedIndex(positions, 100, -1)).toBeNull();
    expect(sourcePointIndexForRenderedIndex(positions, 100, 1.5)).toBeNull();
  });
});

describe("pointPickWorldThreshold", () => {
  it("converts the pixel radius through an orthographic view", () => {
    const camera = new THREE.OrthographicCamera(-2, 2, 1, -1);
    camera.zoom = 2;

    expect(
      pointPickWorldThreshold({
        camera,
        pickRadiusPx: 5,
        referenceDistance: 50,
        viewportHeightPx: 100,
      }),
    ).toBeCloseTo(((1 - -1) / 2 / 100) * 5);
  });

  it("scales with distance through a perspective view", () => {
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);

    // fov 90 → world height at distance d is 2d; 5px of a 100px viewport.
    expect(
      pointPickWorldThreshold({
        camera,
        pickRadiusPx: 5,
        referenceDistance: 10,
        viewportHeightPx: 100,
      }),
    ).toBeCloseTo(((2 * 10) / 100) * 5);
  });

  it("clamps the reference distance to the near plane", () => {
    const camera = new THREE.PerspectiveCamera(90, 1, 0.5, 1000);

    expect(
      pointPickWorldThreshold({
        camera,
        pickRadiusPx: 1,
        referenceDistance: 0,
        viewportHeightPx: 100,
      }),
    ).toBeCloseTo((2 * 0.5) / 100);
  });
});

describe("pick tag walking", () => {
  it("finds blocking tags and layer ids through parent chains", () => {
    const root = new THREE.Group();
    root.userData = { ...POINT_PICK_BLOCKING_USER_DATA };
    const child = new THREE.Mesh();
    root.add(child);

    expect(isPointPickBlocked(child)).toBe(true);
    expect(isPointPickBlocked(new THREE.Mesh())).toBe(false);

    const points = new THREE.Points();
    points.userData = { [POINT_PICK_LAYER_ID_KEY]: "/lidar" };
    const sprite = new THREE.Sprite();
    points.add(sprite);

    expect(pointsLayerIdForObject(sprite)).toBe("/lidar");
    expect(pointsLayerIdForObject(new THREE.Mesh())).toBeNull();
  });
});

describe("resolvePointPick", () => {
  function pickablePoints(layerId: string): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(Float32Array.from([0, 0, 0, 1, 2, 3]), 3),
    );
    const points = new THREE.Points(geometry);
    points.userData = { [POINT_PICK_LAYER_ID_KEY]: layerId };
    points.position.set(10, 0, 0);
    points.updateMatrixWorld(true);
    return points;
  }

  function intersection(
    object: THREE.Object3D,
    index: number | undefined,
    distance: number,
  ): THREE.Intersection {
    return {
      distance,
      index,
      object,
      point: new THREE.Vector3(),
    } as THREE.Intersection;
  }

  it("reads the picked vertex through the object's world matrix", () => {
    const points = pickablePoints("/lidar");
    const vertex = pointsVertexWorldPosition(points, 1, new THREE.Vector3());

    expect(vertex).not.toBeNull();
    expect(vertex?.toArray()).toEqual([11, 2, 3]);
    expect(
      pointsVertexWorldPosition(points, 5, new THREE.Vector3()),
    ).toBeNull();
  });

  it("resolves the nearest point candidate within the screen radius", () => {
    const points = pickablePoints("/lidar");
    const pick = resolvePointPick(
      [intersection(points, 1, 4), intersection(points, 0, 7)],
      () => 2,
      6,
    );

    expect(pick).toEqual({
      color: null,
      layerId: "/lidar",
      renderedIndex: 1,
      worldPosition: [11, 2, 3],
    });
  });

  it("reads the rendered vertex color when the geometry carries one", () => {
    const points = pickablePoints("/lidar");
    points.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(Float32Array.from([1, 0, 0, 0.2, 0.4, 0.6]), 3),
    );

    expect(pointsVertexColor(points, 1)).toEqual([
      Math.fround(0.2),
      Math.fround(0.4),
      Math.fround(0.6),
    ]);
    expect(pointsVertexColor(points, 5)).toBeNull();

    const pick = resolvePointPick([intersection(points, 0, 4)], () => 0, 6);
    expect(pick?.color).toEqual([1, 0, 0]);
  });

  it("skips candidates whose vertex re-projects too far from the pointer", () => {
    const points = pickablePoints("/lidar");
    const distances = new Map<number, number>([
      [11, 30],
      [10, 3],
    ]);
    const pick = resolvePointPick(
      [intersection(points, 1, 4), intersection(points, 0, 7)],
      (worldPoint) => distances.get(worldPoint.x) ?? 100,
      6,
    );

    expect(pick).toEqual({
      color: null,
      layerId: "/lidar",
      renderedIndex: 0,
      worldPosition: [10, 0, 0],
    });
  });

  it("yields to blocking objects anywhere along the ray", () => {
    const points = pickablePoints("/lidar");
    const blocker = new THREE.Mesh();
    blocker.userData = { ...POINT_PICK_BLOCKING_USER_DATA };

    expect(
      resolvePointPick(
        [intersection(points, 1, 4), intersection(blocker, undefined, 9)],
        () => 0,
        6,
      ),
    ).toBeNull();
  });

  it("ignores hits without a layer id or vertex index", () => {
    const points = pickablePoints("/lidar");
    const untagged = new THREE.Points(points.geometry);

    expect(
      resolvePointPick(
        [intersection(untagged, 0, 4), intersection(points, undefined, 5)],
        () => 0,
        6,
      ),
    ).toBeNull();
  });
});
