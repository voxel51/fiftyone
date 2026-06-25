import {
  Box3,
  BufferGeometry,
  Float32BufferAttribute,
  type Intersection,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Points,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import type { ReconciledDetection3D } from "../annotation/types";
import {
  createPointCloudCropFromDetection,
  createPointCloudCropFromPoint,
} from "./point-cloud-crop";
import {
  filterIntersectionsForPointCloudCrop,
  filterPointIntersectionsByScreenDistance,
  getPointCloudRaycastThreshold,
} from "./raycast-utils";

const buildPointCloudCrop = () => {
  return createPointCloudCropFromDetection(
    {
      _cls: "Detection",
      _id: "detection-1",
      path: "ground_truth",
      location: [0, 0, 0],
      dimensions: [2, 2, 2],
      rotation: [0, 0, 0],
    } as ReconciledDetection3D,
    { margin: 0 }
  )!;
};

const buildPoints = () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3));
  return new Points(geometry);
};

const buildIntersection = (object: Mesh | Points, point: Vector3) =>
  ({
    object,
    point,
    distance: 1,
  } as Intersection);

const buildPanelElement = (width = 100, height = 100) =>
  ({
    clientHeight: height,
    getBoundingClientRect: () =>
      ({
        width,
        height,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect),
  } as HTMLElement);

const buildPerspectiveCamera = () => {
  const camera = new PerspectiveCamera(90, 1, 0.1, 1000);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
};

describe("filterIntersectionsForPointCloudCrop", () => {
  it("keeps non-point intersections unchanged", () => {
    const meshIntersection = buildIntersection(
      new Mesh(new BufferGeometry()),
      new Vector3(10, 10, 10)
    );

    expect(
      filterIntersectionsForPointCloudCrop(
        [meshIntersection],
        buildPointCloudCrop()
      )
    ).toEqual([meshIntersection]);
  });

  it("skips point intersections outside the active crop", () => {
    const inside = buildIntersection(buildPoints(), new Vector3(0.5, 0, 0));
    const outside = buildIntersection(buildPoints(), new Vector3(2, 0, 0));

    expect(
      filterIntersectionsForPointCloudCrop(
        [outside, inside],
        buildPointCloudCrop()
      )
    ).toEqual([inside]);
  });

  it("returns an empty result when all point hits are cropped out", () => {
    const outside = buildIntersection(buildPoints(), new Vector3(2, 0, 0));

    expect(
      filterIntersectionsForPointCloudCrop([outside], buildPointCloudCrop())
    ).toEqual([]);
  });

  it("uses axis-aligned bounds for raycast-hover point crops", () => {
    const inside = buildIntersection(buildPoints(), new Vector3(0.5, 0, 0));
    const insideCorner = buildIntersection(
      buildPoints(),
      new Vector3(0.8, 0.8, 0.8)
    );
    const outside = buildIntersection(buildPoints(), new Vector3(1.1, 0, 0));

    expect(
      filterIntersectionsForPointCloudCrop(
        [outside, insideCorner, inside],
        createPointCloudCropFromPoint([0, 0, 0], { margin: 1 })
      )
    ).toEqual([insideCorner, inside]);
  });
});

describe("getPointCloudRaycastThreshold", () => {
  it("derives orthographic thresholds from visible world height", () => {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.zoom = 2;
    camera.updateProjectionMatrix();

    expect(
      getPointCloudRaycastThreshold({
        camera,
        panelElement: buildPanelElement(100, 100),
        pickRadiusPx: 4,
      })
    ).toBeCloseTo(0.04);
  });

  it("derives perspective thresholds from scene depth", () => {
    const camera = buildPerspectiveCamera();
    const sceneBoundingBox = new Box3(
      new Vector3(-1, -1, -1),
      new Vector3(1, 1, 1)
    );
    const depth = 10 + Math.sqrt(3);

    expect(
      getPointCloudRaycastThreshold({
        camera,
        panelElement: buildPanelElement(100, 100),
        sceneBoundingBox,
        pickRadiusPx: 4,
      })
    ).toBeCloseTo(((2 * depth) / 100) * 4);
  });

  it("returns zero when panel height is unavailable", () => {
    expect(
      getPointCloudRaycastThreshold({
        camera: buildPerspectiveCamera(),
        panelElement: buildPanelElement(100, 0),
        pickRadiusPx: 4,
      })
    ).toBe(0);
  });
});

describe("filterPointIntersectionsByScreenDistance", () => {
  it("keeps non-point intersections unchanged", () => {
    const meshIntersection = buildIntersection(
      new Mesh(new BufferGeometry()),
      new Vector3(10, 10, 10)
    );

    expect(
      filterPointIntersectionsByScreenDistance({
        intersections: [meshIntersection],
        camera: buildPerspectiveCamera(),
        panelElement: buildPanelElement(),
        ndc: { x: 0, y: 0 },
        pickRadiusPx: 4,
      })
    ).toEqual([meshIntersection]);
  });

  it("keeps point intersections within the screen-space pick radius", () => {
    const inside = buildIntersection(buildPoints(), new Vector3(0.5, 0, 0));
    const outside = buildIntersection(buildPoints(), new Vector3(2, 0, 0));

    expect(
      filterPointIntersectionsByScreenDistance({
        intersections: [outside, inside],
        camera: buildPerspectiveCamera(),
        panelElement: buildPanelElement(),
        ndc: { x: 0, y: 0 },
        pickRadiusPx: 4,
      })
    ).toEqual([inside]);
  });
});
