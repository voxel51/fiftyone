/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import * as TSL from "three/tsl";
import { PointsNodeMaterial } from "three/webgpu";

import type { ImageViewTransform } from "../media-2d/Base2dScene";
import {
  createGpuCameraProjectionNodes,
  updateGpuCameraProjectionBindings,
  type GpuCameraProjection,
  type GpuCameraProjectionBindings,
} from "./gpu-camera-projection";
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
} from "../scene-3d/gpu/gpu-point-cloud-color-nodes";
import type { ResolvedGpuPointCloudColor } from "../scene-3d/gpu/gpu-point-cloud-color";
import {
  gpuPointCloudChannelValueNode,
  gpuPointCloudRgbNode,
} from "../scene-3d/gpu/gpu-point-cloud-channel-nodes";
import { gpuPointCloudSampleIndexNode } from "../scene-3d/gpu/gpu-point-cloud-position-nodes";
import { DEFAULT_POINT_SIZE } from "../scene-3d/PointCloudSceneLayer";
import type {
  CameraProjectionNode,
  PointCloudPositionNode,
  PointCloudProjectionNode,
  PointCloudProjectionTslFacade,
  PointCloudProjectionUniformNode,
} from "../tsl-chainables";

const CULLED_POSITION = 1e9;
const MIN_VIEW_SCALE = 1e-6;
const PROJECTION_Z = 0.1;
const DEFAULT_RENDER_ORDER = 10;
const NOOP_RAYCAST = () => undefined;
const EMPTY_PROJECTION_CHANNEL_ATTRIBUTES = new Map<
  string,
  THREE.InstancedBufferAttribute
>();

const projectionTsl: PointCloudProjectionTslFacade = TSL;

type ProjectionPointsMaterial = PointsNodeMaterial & {
  fragmentNode: TSL.Node | null;
  scaleNode: PointCloudProjectionNode | null;
};

type ProjectionSensorNode = CameraProjectionNode & PointCloudPositionNode;

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
  /** Clips each point sprite to a circle instead of its backing quad. */
  readonly circular?: boolean;
  /** Camera-model projection shared with the integer picker. */
  readonly projection: GpuCameraProjection;
  /** Canvas-global allocation for this view/layer draw. */
  readonly renderedPointCount?: number;
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
  circular = false,
  fit,
  imageHeight,
  imageWidth,
  minScreenPointSize = 1,
  pointSize,
  pointSizeScale = 1,
  projection,
  renderOrder = DEFAULT_RENDER_ORDER,
  renderedPointCount,
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
        circular,
        projection,
        resource,
      }),
    // Matrix, viewport, point size, and color ranges update mutable uniforms
    // below. Only resource/color-source topology rebuilds the TSL graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [circular, colorNodeKey, projection.kind, resource],
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

  // This layout effect retains topic attributes while the scene references
  // them, so retired geometry survives until every camera view releases it.
  useLayoutEffect(
    () => retainGpuPointCloudProjectionResource(resource),
    [resource],
  );

  // This layout effect binds projection uniforms before the frame is rendered.
  useLayoutEffect(() => {
    sprite.count = Math.min(
      resource.sampledPointCount,
      renderedPointCount ?? resource.sampledPointCount,
    );
    updateGpuPointCloudColorUniforms(shader.colorUniforms, color);
    updateGpuCameraProjectionBindings(shader.cameraProjection, projection);
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
      ? Math.max(MIN_VIEW_SCALE, viewTransform?.scale ?? 1)
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
    projection,
    renderedPointCount,
    resource,
    shader,
    sprite,
    viewTransform?.scale,
  ]);

  // This effect disposes the projection material when it is replaced.
  useEffect(() => () => shader.material.dispose(), [shader.material]);

  return <primitive object={sprite} />;
}

/** Shader material and mutable uniforms used by a projection layer. */
export interface GpuPointCloudProjectionMaterial {
  readonly cameraProjection: GpuCameraProjectionBindings;
  readonly colorUniforms: GpuPointCloudColorUniforms;
  readonly dimensions: PointCloudProjectionUniformNode<THREE.Vector2>;
  readonly imageRect: PointCloudProjectionUniformNode<THREE.Vector4>;
  readonly material: ProjectionPointsMaterial;
}

/** Exported to keep shader construction directly testable without a GPU. */
export function createGpuPointCloudProjectionMaterial({
  calibrationHeight,
  calibrationWidth,
  color,
  circular = false,
  imageRect = new THREE.Vector4(0, 0, 1, 1),
  projection,
  resource,
}: {
  readonly calibrationHeight: number;
  readonly calibrationWidth: number;
  readonly color: ResolvedGpuPointCloudColor;
  readonly circular?: boolean;
  readonly imageRect?: THREE.Vector4;
  readonly projection: GpuCameraProjection;
  readonly resource: GpuPointCloudProjectionResource;
}): GpuPointCloudProjectionMaterial {
  const material = new PointsNodeMaterial({
    sizeAttenuation: false,
  }) as ProjectionPointsMaterial;
  material.depthTest = false;
  material.depthWrite = false;
  material.toneMapped = false;

  const dimensionsUniform = projectionTsl.uniform(
    new THREE.Vector2(calibrationWidth, calibrationHeight),
  );
  const imageRectUniform = projectionTsl.uniform(imageRect.clone());
  const colorUniforms = createGpuPointCloudColorUniforms(color);
  const sensorPosition = TSL.instancedBufferAttribute<ProjectionSensorNode>(
    resource.positionAttribute,
    "vec3",
  );
  const sampleIndex = gpuPointCloudSampleIndexNode();
  // Direct vertex projection avoids a per-camera compute pass and UV buffer.
  // The shared camera-model graph returns calibration-pixel coordinates.
  const projected = createGpuCameraProjectionNodes(sensorPosition, projection);
  const u = projected.u;
  const v = projected.v;
  const visible = projectionTsl.and(
    projected.valid,
    projectionTsl.greaterThanEqual(u, 0),
    projectionTsl.greaterThanEqual(v, 0),
    projectionTsl.lessThan(u, dimensionsUniform.x),
    projectionTsl.lessThan(v, dimensionsUniform.y),
  );
  // Base2dScene's orthographic plane spans [-0.5, 0.5]. Convert calibration
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
  );
  material.scaleNode = projectionTsl.select(
    visible,
    projectionTsl.vec2(1, 1),
    projectionTsl.vec2(0, 0),
  );
  const rgbNode = resource.colorChannel
    ? gpuPointCloudRgbNode(resource.colorChannel, sampleIndex)
    : null;
  const scalarNodes = new Map<string, TSL.Node>();
  for (const [name, channel] of resource.scalarChannels) {
    scalarNodes.set(name, gpuPointCloudChannelValueNode(channel, sampleIndex));
  }
  const colorNode = createGpuPointCloudColorNode(
    color,
    {
      color: null,
      colorNode: rgbNode,
      positionNode: sensorPosition,
      scalar: EMPTY_PROJECTION_CHANNEL_ATTRIBUTES,
      scalarNodes,
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
  const outsideCircle: PointCloudProjectionNode = projectionTsl
    .uv()
    .sub(0.5)
    .length()
    .greaterThan(0.5);
  material.fragmentNode = projectionTsl.Fn(() => {
    projectionTsl.Discard(outsideImage);
    if (circular) projectionTsl.Discard(outsideCircle);
    return projectionTsl.vec4(colorNode, 1);
  })();

  return {
    cameraProjection: projected.bindings,
    colorUniforms,
    dimensions: dimensionsUniform,
    imageRect: imageRectUniform,
    material,
  };
}

export default GpuPointCloudProjectionLayer;
