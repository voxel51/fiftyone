import * as THREE from "three";

import { pointPickWorldThreshold } from "./point-picking";

/** Interactive 3D line tolerance in CSS pixels. */
const SCREEN_SPACE_LINE_PICK_RADIUS_PX = 2;

type LineRaycast = (
  this: THREE.LineSegments,
  raycaster: THREE.Raycaster,
  intersects: THREE.Intersection[],
) => void;

const lineSegmentsRaycast = THREE.LineSegments.prototype.raycast;

/** Keeps line picking approximately constant in screen space across zoom. */
export function createScreenSpaceLineRaycast(
  viewportHeightPx: number,
): LineRaycast {
  const worldPosition = new THREE.Vector3();

  return function raycast(raycaster, intersects) {
    const camera = raycaster.camera;
    if (!camera || viewportHeightPx <= 0) {
      lineSegmentsRaycast.call(this, raycaster, intersects);
      return;
    }

    const previousThreshold = raycaster.params.Line.threshold;
    this.getWorldPosition(worldPosition);
    raycaster.params.Line.threshold = pointPickWorldThreshold({
      camera,
      pickRadiusPx: SCREEN_SPACE_LINE_PICK_RADIUS_PX,
      referenceDistance: raycaster.ray.origin.distanceTo(worldPosition),
      viewportHeightPx,
    });
    try {
      lineSegmentsRaycast.call(this, raycaster, intersects);
    } finally {
      raycaster.params.Line.threshold = previousThreshold;
    }
  };
}
