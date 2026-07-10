/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import * as TSL from "three/tsl";
import { PointsNodeMaterial } from "three/webgpu";

import type { ImageViewTransform } from "../base-2d-scene";
import {
  gpuProjectionImagePlaneSize,
  gpuProjectionViewportRect,
} from "./gpu-point-cloud-projection";
import {
  retainGpuPointCloudProjectionResource,
  type GpuPointCloudProjectionResource,
} from "./gpu-point-cloud-projection-resources";
import {
  createGpuPointCloudColorNode,
  createGpuPointCloudColorUniforms,
  gpuPointCloudColorNodeKey,
  updateGpuPointCloudColorUniforms,
  type GpuPointCloudColorUniforms,
} from "../point-cloud/gpu/gpu-point-cloud-color-nodes";
import type { ResolvedGpuPointCloudColor } from "../point-cloud/gpu/gpu-point-cloud-color";
import { DEFAULT_POINT_SIZE } from "../point-cloud/PointCloudSceneLayer";

const MIN_PROJECTABLE_DEPTH = 1e-6;
const CULLED_POSITION = 1e9;
const PROJECTION_Z = 0.1;
const DEFAULT_RENDER_ORDER = 10;
const NOOP_RAYCAST = () => undefined;

interface ProjectionNode {
  readonly w: ProjectionNode;
  readonly x: ProjectionNode;
  readonly y: ProjectionNode;
  readonly z: ProjectionNode;
  div(value: ProjectionNode | number): ProjectionNode;
  mul(value: ProjectionNode | number): ProjectionNode;
  sub(value: ProjectionNode | number): ProjectionNode;
}

interface ProjectionUniformNode<T> extends ProjectionNode {
  value: T;
}

const projectionTsl = TSL as unknown as {
  Discard(condition: ProjectionNode): void;
  Fn(callback: () => ProjectionNode): () => ProjectionNode;
  and(...conditions: readonly ProjectionNode[]): ProjectionNode;
  greaterThan(
    left: ProjectionNode,
    right: ProjectionNode | number,
  ): ProjectionNode;
  greaterThanEqual(
    left: ProjectionNode,
    right: ProjectionNode | number,
  ): ProjectionNode;
  lessThan(
    left: ProjectionNode,
    right: ProjectionNode | number,
  ): ProjectionNode;
  or(...conditions: readonly ProjectionNode[]): ProjectionNode;
  select(
    condition: ProjectionNode,
    whenTrue: ProjectionNode,
    whenFalse: ProjectionNode,
  ): ProjectionNode;
  uniform<T extends THREE.Matrix4 | THREE.Vector2 | THREE.Vector4>(
    value: T,
  ): ProjectionUniformNode<T>;
  vec2(...values: readonly (ProjectionNode | number)[]): ProjectionNode;
  vec3(...values: readonly (ProjectionNode | number)[]): ProjectionNode;
  vec4(...values: readonly (ProjectionNode | number)[]): ProjectionNode;
  viewportUV: ProjectionNode;
};

type ProjectionPointsMaterial = PointsNodeMaterial & {
  fragmentNode: TSL.Node | null;
  scaleNode: ProjectionNode | null;
};

/** Rendering inputs for one GPU-projected point-cloud layer. */
export interface GpuPointCloudProjectionLayerProps {
  readonly calibrationHeight: number;
  readonly calibrationWidth: number;
  /** Colour policy resolved without scanning the prepared arrays. */
  readonly color: ResolvedGpuPointCloudColor;
  readonly fit: "contain" | "cover";
  readonly imageHeight: number;
  readonly imageWidth: number;
  /** Screen-space floor used by hover emphasis markers. */
  readonly minScreenPointSize?: number;
  /** CSS-pixel dot size. */
  readonly pointSize: number;
  /** Additional screen-space scale used by hover emphasis animation. */
  readonly pointSizeScale?: number;
  /** Homogeneous sensor-to-calibration-pixel matrix. */
  readonly projectionMatrix: THREE.Matrix4;
  /** Grow-only source-topic buffers shared by every camera view. */
  readonly resource: GpuPointCloudProjectionResource;
  readonly renderOrder?: number;
  readonly viewTransform?: ImageViewTransform;
}

/**
 * GPU-native pointcloud projection layer for the orthographic image scene.
 * One instanced screen-space quad is submitted per prepared point; the vertex
 * shader performs sensor-to-camera and camera-to-pixel projection and moves
 * invalid instances outside the clip volume.
 */
export function GpuPointCloudProjectionLayer({
  calibrationHeight,
  calibrationWidth,
  color,
  fit,
  imageHeight,
  imageWidth,
  minScreenPointSize = 1,
  pointSize,
  pointSizeScale = 1,
  projectionMatrix,
  renderOrder = DEFAULT_RENDER_ORDER,
  resource,
  viewTransform,
}: GpuPointCloudProjectionLayerProps) {
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const colorNodeKey = gpuPointCloudColorNodeKey(color);
  const imagePlaneSize = useMemo(
    () =>
      gpuProjectionImagePlaneSize({
        containerHeight: size.height,
        containerWidth: size.width,
        fit,
        imageHeight,
        imageWidth,
      }),
    [fit, imageHeight, imageWidth, size.height, size.width],
  );
  const imageRect = useMemo(
    () =>
      gpuProjectionViewportRect({
        containerHeight: size.height,
        containerWidth: size.width,
        fit,
        imageHeight,
        imageWidth,
        viewTransform,
      }),
    [fit, imageHeight, imageWidth, size.height, size.width, viewTransform],
  );
  const shader = useMemo(
    () =>
      createGpuPointCloudProjectionMaterial({
        calibrationHeight: 1,
        calibrationWidth: 1,
        color,
        projectionMatrix: new THREE.Matrix4(),
        resource,
      }),
    // Matrix, viewport, point size, and color ranges update mutable uniforms
    // below. Only resource/color-source topology rebuilds the TSL graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorNodeKey, resource],
  );
  const sprite = useMemo(() => {
    const next = new THREE.Sprite(
      shader.material as unknown as THREE.SpriteMaterial,
    );
    next.count = 0;
    next.geometry = resource.geometry;
    next.frustumCulled = false;
    next.raycast = NOOP_RAYCAST;
    next.renderOrder = renderOrder;
    return next;
  }, [renderOrder, resource.geometry, shader.material]);

  useLayoutEffect(
    // A camera view leases topic attributes for as long as its committed scene
    // references them. Capacity replacement may retire the resource, but its
    // geometry cannot be disposed until every old camera view releases.
    () => retainGpuPointCloudProjectionResource(resource),
    [resource],
  );

  useLayoutEffect(() => {
    sprite.count = resource.sampledPointCount;
    updateGpuPointCloudColorUniforms(shader.colorUniforms, color);
    shader.projectionMatrix.value.copy(projectionMatrix);
    shader.dimensions.value.set(calibrationWidth, calibrationHeight);
    shader.imageRect.value.set(
      imageRect.left,
      imageRect.top,
      imageRect.right,
      imageRect.bottom,
    );
    // Match the Canvas2D path: dots are sized in calibration pixels, then
    // scale with the fitted image and zoom into screen pixels.
    const calibrationDotSize = Math.max(
      2,
      Math.round((calibrationWidth / 400) * (pointSize / DEFAULT_POINT_SIZE)),
    );
    const viewScale = Number.isFinite(viewTransform?.scale)
      ? Math.max(MIN_PROJECTABLE_DEPTH, viewTransform?.scale ?? 1)
      : 1;
    shader.material.size =
      Math.max(
        minScreenPointSize,
        (calibrationDotSize * imagePlaneSize.width * viewScale) /
          calibrationWidth,
      ) * Math.max(0, pointSizeScale);
    invalidate();
  }, [
    calibrationHeight,
    calibrationWidth,
    imagePlaneSize.height,
    imagePlaneSize.width,
    imageRect.bottom,
    imageRect.left,
    imageRect.right,
    imageRect.top,
    color,
    invalidate,
    minScreenPointSize,
    pointSize,
    pointSizeScale,
    projectionMatrix,
    resource,
    shader,
    sprite,
    viewTransform?.scale,
  ]);

  useEffect(() => () => shader.material.dispose(), [shader.material]);

  return <primitive object={sprite} />;
}

/** Shader material and mutable uniforms used by a projection layer. */
export interface GpuPointCloudProjectionMaterial {
  readonly colorUniforms: GpuPointCloudColorUniforms;
  readonly dimensions: ProjectionUniformNode<THREE.Vector2>;
  readonly imageRect: ProjectionUniformNode<THREE.Vector4>;
  readonly material: ProjectionPointsMaterial;
  readonly projectionMatrix: ProjectionUniformNode<THREE.Matrix4>;
}

/** Exported to keep shader construction directly testable without a GPU. */
export function createGpuPointCloudProjectionMaterial({
  calibrationHeight,
  calibrationWidth,
  color,
  imageRect = new THREE.Vector4(0, 0, 1, 1),
  projectionMatrix,
  resource,
}: {
  readonly calibrationHeight: number;
  readonly calibrationWidth: number;
  readonly color: ResolvedGpuPointCloudColor;
  readonly imageRect?: THREE.Vector4;
  readonly projectionMatrix: THREE.Matrix4;
  readonly resource: GpuPointCloudProjectionResource;
}): GpuPointCloudProjectionMaterial {
  const material = new PointsNodeMaterial({
    sizeAttenuation: false,
  }) as ProjectionPointsMaterial;
  material.depthTest = false;
  material.depthWrite = false;
  material.toneMapped = false;

  const matrixUniform = projectionTsl.uniform(projectionMatrix.clone());
  const dimensionsUniform = projectionTsl.uniform(
    new THREE.Vector2(calibrationWidth, calibrationHeight),
  );
  const imageRectUniform = projectionTsl.uniform(imageRect.clone());
  const colorUniforms = createGpuPointCloudColorUniforms(color);
  const sensorPosition = TSL.instancedBufferAttribute(
    resource.positionAttribute,
    "vec3",
  ) as unknown as ProjectionNode;
  // Direct vertex projection avoids a per-camera compute pass and UV buffer.
  // The precomposed matrix returns [u*z, v*z, z, 1] in calibration pixels.
  const homogeneous = matrixUniform.mul(projectionTsl.vec4(sensorPosition, 1));
  const depth = homogeneous.z;
  const u = homogeneous.x.div(depth);
  const v = homogeneous.y.div(depth);
  const visible = projectionTsl.and(
    projectionTsl.greaterThan(depth, MIN_PROJECTABLE_DEPTH),
    projectionTsl.greaterThanEqual(u, 0),
    projectionTsl.greaterThanEqual(v, 0),
    projectionTsl.lessThan(u, dimensionsUniform.x),
    projectionTsl.lessThan(v, dimensionsUniform.y),
  );
  // Base2DScene's orthographic plane spans [-0.5, 0.5]. Convert calibration
  // pixels into that local space; its parent applies contain/cover and pan/zoom.
  const projectedPosition = projectionTsl.vec3(
    u.div(dimensionsUniform.x).sub(0.5),
    v.div(dimensionsUniform.y).sub(0.5).mul(-1),
    PROJECTION_Z,
  );
  material.positionNode = projectionTsl.select(
    visible,
    projectedPosition,
    projectionTsl.vec3(CULLED_POSITION, CULLED_POSITION, PROJECTION_Z),
  ) as unknown as TSL.Node;
  material.scaleNode = projectionTsl.select(
    visible,
    projectionTsl.vec2(1, 1),
    projectionTsl.vec2(0, 0),
  );
  const colorNode = createGpuPointCloudColorNode(
    color,
    {
      color: resource.colorAttribute,
      positionNode: sensorPosition as unknown as TSL.Node,
      scalar: resource.scalarAttributes,
    },
    colorUniforms,
  );
  material.colorNode = colorNode;
  // Sprite quads can straddle the fitted image edge even when their centers
  // are valid. Fragment clipping prevents dots from bleeding into letterbox
  // or neighboring scissored camera views.
  const outsideImage = projectionTsl.or(
    projectionTsl.lessThan(projectionTsl.viewportUV.x, imageRectUniform.x),
    projectionTsl.lessThan(projectionTsl.viewportUV.y, imageRectUniform.y),
    projectionTsl.greaterThan(projectionTsl.viewportUV.x, imageRectUniform.z),
    projectionTsl.greaterThan(projectionTsl.viewportUV.y, imageRectUniform.w),
  );
  material.fragmentNode = projectionTsl.Fn(() => {
    projectionTsl.Discard(outsideImage);
    return projectionTsl.vec4(colorNode as unknown as ProjectionNode, 1);
  })() as unknown as TSL.Node;

  return {
    colorUniforms,
    dimensions: dimensionsUniform,
    imageRect: imageRectUniform,
    material,
    projectionMatrix: matrixUniform,
  };
}

export default GpuPointCloudProjectionLayer;
