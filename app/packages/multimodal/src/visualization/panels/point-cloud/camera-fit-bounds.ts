import * as THREE from "three";

import type {
  SceneArrowPrimitive,
  SceneCubePrimitive,
  SceneCylinderPrimitive,
  SceneLinePrimitive,
  SceneModelPrimitive,
  ScenePoint3D,
  ScenePose3D,
  SceneSpherePrimitive,
  SceneTextPrimitive,
  SceneTrianglePrimitive,
} from "../../../decoders";
import { EMPTY_POINT_CLOUD_BOUNDS_SIZE } from "./point-cloud-colors";
import { SCENE_TEXT_DEFAULT_WORLD_HEIGHT } from "./scene-text-sprite";
import {
  matrixFromObjectTransform,
  pointCloudObjectTransform,
  scenePoseObjectTransform,
} from "./transforms";
import type {
  GridPanelLayer,
  PointCloudCameraPose,
  PointCloudFrameTransform,
  PointCloudRenderLayer,
  SceneAnnotationPanelLayer,
} from "./types";
import {
  isFinitePoint3,
  isFinitePositiveNumber,
  isFinitePositiveVector,
  primitivePointIndices,
} from "./utils";

// Initial camera pose: elevated and offset so the full scene is in view.
export const PERSPECTIVE_POINT_CAMERA = {
  far: 10000,
  fov: 50,
  near: 0.01,
  position: [8, 5, 8] as [number, number, number],
};
const CAMERA_FIT_PADDING = 1.35;
const SCENE_MODEL_FALLBACK_SIZE = 1;

/**
 * Combined world-space bounds for all current layers. Each layer's geometry
 * bounds start in its local point-cloud frame, so transforms must be applied
 * before the boxes can be unioned for camera fitting.
 *
 * Grid (map) layers can span hundreds of meters, so they never widen bounds
 * that other content already established — otherwise the camera fit would
 * frame the whole city map instead of the ego vehicle. They only drive the
 * fit when they are the only visible content.
 */
export function sceneBoundsForLayers(
  layers: readonly PointCloudRenderLayer[],
  annotationLayers: readonly SceneAnnotationPanelLayer[],
  gridLayers: readonly GridPanelLayer[] = [],
): THREE.Box3 | null {
  const sceneBounds = new THREE.Box3();
  sceneBounds.makeEmpty();

  for (const { data, layer } of layers) {
    sceneBounds.union(worldBoundsForLayer(data.bounds, layer.frameTransform));
  }
  for (const layer of annotationLayers) {
    const bounds = boundsForAnnotationLayer(layer);
    if (bounds) {
      sceneBounds.union(bounds);
    }
  }
  if (!sceneBounds.isEmpty()) {
    return sceneBounds;
  }

  for (const layer of gridLayers) {
    const bounds = boundsForGridLayer(layer);
    if (bounds) {
      sceneBounds.union(bounds);
    }
  }

  return sceneBounds.isEmpty() ? null : sceneBounds;
}

function boundsForGridLayer(layer: GridPanelLayer): THREE.Box3 | null {
  const width = layer.frame.columnCount * layer.frame.cellSize[0];
  const height = layer.frame.rowCount * layer.frame.cellSize[1];
  if (!isFinitePositiveNumber(width) || !isFinitePositiveNumber(height)) {
    return null;
  }

  return new THREE.Box3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(width, height, 0),
  )
    .applyMatrix4(
      matrixFromObjectTransform(scenePoseObjectTransform(layer.frame.pose)),
    )
    .applyMatrix4(
      matrixFromObjectTransform(
        pointCloudObjectTransform(layer.frameTransform),
      ),
    );
}

function boundsForAnnotationLayer(
  layer: SceneAnnotationPanelLayer,
): THREE.Box3 | null {
  const layerBounds = new THREE.Box3();
  layerBounds.makeEmpty();

  for (const entity of layer.frame.entities) {
    for (const arrow of entity.arrows) {
      const bounds = boundsForSceneArrow(arrow);
      if (bounds) layerBounds.union(bounds);
    }
    for (const cube of entity.cubes) {
      const bounds = boundsForSceneCube(cube);
      if (bounds) layerBounds.union(bounds);
    }
    for (const cylinder of entity.cylinders) {
      const bounds = boundsForSceneCylinder(cylinder);
      if (bounds) layerBounds.union(bounds);
    }
    for (const line of entity.lines) {
      const bounds = boundsForSceneLine(line);
      if (bounds) layerBounds.union(bounds);
    }
    for (const model of entity.models) {
      const bounds = boundsForSceneModel(model);
      if (bounds) layerBounds.union(bounds);
    }
    for (const sphere of entity.spheres) {
      const bounds = boundsForSceneSphere(sphere);
      if (bounds) layerBounds.union(bounds);
    }
    for (const text of entity.texts) {
      const bounds = boundsForSceneText(text);
      if (bounds) layerBounds.union(bounds);
    }
    for (const triangle of entity.triangles) {
      const bounds = boundsForSceneTriangle(triangle);
      if (bounds) layerBounds.union(bounds);
    }
  }

  return layerBounds.isEmpty()
    ? null
    : worldBoundsForLayer(layerBounds, layer.frameTransform);
}

function boundsForSceneArrow(arrow: SceneArrowPrimitive): THREE.Box3 | null {
  const length = Math.max(0, arrow.shaftLength) + Math.max(0, arrow.headLength);
  const radius = Math.max(arrow.shaftDiameter, arrow.headDiameter) / 2;
  if (!isFinitePositiveNumber(length) || !isFinitePositiveNumber(radius)) {
    return null;
  }

  return boundsForBoxWithPose(
    arrow.pose,
    new THREE.Vector3(0, -radius, -radius),
    new THREE.Vector3(length, radius, radius),
  );
}

function boundsForSceneCube(cube: SceneCubePrimitive): THREE.Box3 | null {
  return boundsForPoseAndSize(cube.pose, cube.size);
}

function boundsForSceneCylinder(
  cylinder: SceneCylinderPrimitive,
): THREE.Box3 | null {
  return boundsForPoseAndSize(cylinder.pose, cylinder.size);
}

function boundsForSceneLine(line: SceneLinePrimitive): THREE.Box3 | null {
  return boundsForScenePoints(
    line.points,
    primitivePointIndices(line.points, line.indices),
    line.pose,
  );
}

function boundsForSceneModel(model: SceneModelPrimitive): THREE.Box3 | null {
  return boundsForPoseAndSize(
    model.pose,
    isFinitePositiveVector(model.scale)
      ? model.scale
      : [
          SCENE_MODEL_FALLBACK_SIZE,
          SCENE_MODEL_FALLBACK_SIZE,
          SCENE_MODEL_FALLBACK_SIZE,
        ],
  );
}

function boundsForSceneSphere(sphere: SceneSpherePrimitive): THREE.Box3 | null {
  return boundsForPoseAndSize(sphere.pose, sphere.size);
}

function boundsForSceneText(text: SceneTextPrimitive): THREE.Box3 | null {
  if (!text.text) {
    return null;
  }

  const height = text.scaleInvariant
    ? SCENE_TEXT_DEFAULT_WORLD_HEIGHT
    : Math.max(
        SCENE_TEXT_DEFAULT_WORLD_HEIGHT,
        text.fontSize || SCENE_TEXT_DEFAULT_WORLD_HEIGHT,
      );
  const width = Math.max(height, text.text.length * height * 0.5);

  return boundsForPoseAndSize(text.pose, [width, height, 0.05]);
}

function boundsForSceneTriangle(
  triangle: SceneTrianglePrimitive,
): THREE.Box3 | null {
  return boundsForScenePoints(
    triangle.points,
    primitivePointIndices(triangle.points, triangle.indices),
    triangle.pose,
  );
}

function boundsForPoseAndSize(
  pose: ScenePose3D,
  size: readonly [number, number, number],
): THREE.Box3 | null {
  if (!isFinitePositiveVector(size)) {
    return null;
  }

  return new THREE.Box3()
    .setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(...size))
    .applyMatrix4(matrixFromObjectTransform(scenePoseObjectTransform(pose)));
}

function boundsForBoxWithPose(
  pose: ScenePose3D,
  min: THREE.Vector3,
  max: THREE.Vector3,
): THREE.Box3 {
  return new THREE.Box3(min, max).applyMatrix4(
    matrixFromObjectTransform(scenePoseObjectTransform(pose)),
  );
}

function boundsForScenePoints(
  points: readonly ScenePoint3D[],
  pointIndices: readonly number[],
  pose: ScenePose3D,
): THREE.Box3 | null {
  const bounds = new THREE.Box3();
  bounds.makeEmpty();

  for (const pointIndex of pointIndices) {
    const point = points[pointIndex];
    if (isFinitePoint3(point)) {
      bounds.expandByPoint(new THREE.Vector3(...point));
    }
  }

  return bounds.isEmpty()
    ? null
    : bounds.applyMatrix4(
        matrixFromObjectTransform(scenePoseObjectTransform(pose)),
      );
}

/**
 * Converts one layer's local geometry bounds into panel world coordinates.
 * The returned box is cloned so the render data can keep reusing its local
 * bounding box for geometry and future fit calculations.
 */
function worldBoundsForLayer(
  bounds: THREE.Box3,
  frameTransform: PointCloudFrameTransform | undefined,
): THREE.Box3 {
  return bounds
    .clone()
    .applyMatrix4(
      matrixFromObjectTransform(pointCloudObjectTransform(frameTransform)),
    );
}

/**
 * Frames a bounding box from the panel's default diagonal viewing direction.
 * The radius/FOV calculation places the camera far enough back for the whole
 * box to fit, with padding so points are not pinned to the viewport edge.
 */
export function cameraPoseForBounds(
  bounds: THREE.Box3 | null,
): PointCloudCameraPose | null {
  if (!bounds) {
    return null;
  }

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(EMPTY_POINT_CLOUD_BOUNDS_SIZE, size.length() / 2);
  const fovRad = THREE.MathUtils.degToRad(PERSPECTIVE_POINT_CAMERA.fov);
  const distance = (radius / Math.sin(fovRad / 2)) * CAMERA_FIT_PADDING;
  const direction = new THREE.Vector3(...PERSPECTIVE_POINT_CAMERA.position)
    .normalize()
    .multiplyScalar(distance);
  const position = center.clone().add(direction);

  return {
    position: [position.x, position.y, position.z],
    target: [center.x, center.y, center.z],
  };
}
