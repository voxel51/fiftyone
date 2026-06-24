import {
  BufferGeometry,
  Float32BufferAttribute,
  type Intersection,
  Mesh,
  Points,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import type { ReconciledDetection3D } from "../annotation/types";
import { createPointCloudCropFromDetection } from "./point-cloud-crop";
import { filterIntersectionsForPointCloudCrop } from "./raycast-utils";

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
});
