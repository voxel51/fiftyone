/* eslint-disable react/no-unknown-property */
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { CameraCalibrationVisualization } from "../../../decoders";
import { CLICK_DRAG_TOLERANCE_PX } from "../interaction";
import { useImageTextureLease } from "../use-image-texture-lease";
import { POINT_PICK_BLOCKING_USER_DATA } from "./point-picking";
import { useScenePicking } from "./scene-interactivity";
import { pointCloudObjectTransform } from "./transforms";
import type { CameraFrustumPanelLayer, CameraImageRayModel } from "./types";
import { useInvalidateOn } from "./use-invalidate-on";
import {
  SCENE_SELECTED_DASH_SIZE,
  SCENE_SELECTED_GAP_SIZE,
  clamp01,
  isFinitePositiveNumber,
  withLineDistances,
} from "./utils";

// Camera frustum wireframes are purely presentational — depth is not data,
// which is also why frustums never participate in camera-fit bounds.
const DEFAULT_CAMERA_FRUSTUM_DEPTH_M = 2.75;
const CAMERA_FRUSTUM_COLOR = 0xffaa33;
const DEFAULT_CAMERA_FRUSTUM_OPACITY = 0.85;
const CAMERA_FRUSTUM_AXIS_LENGTH_RATIO = 0.28;
const CAMERA_FRUSTUM_AXIS_LINE_WIDTH = 2;
// Highlighted (linked camera tile hovered / pending select) style.
const CAMERA_FRUSTUM_HIGHLIGHT_COLOR = 0xffffff;
const CAMERA_FRUSTUM_HIGHLIGHT_OPACITY = 1;
const CAMERA_BOUNDARY_SEGMENTS_PER_EDGE = 16;
const CAMERA_SURFACE_COLUMNS = 48;
const CAMERA_SURFACE_ROWS = 32;
// Memoized: hovering or focusing one linked camera tile re-renders that
// frustum and the one losing emphasis, not every camera in the scene.
export const CameraFrustumSceneLayer = memo(function CameraFrustumSceneLayer({
  layer,
  onTextureError,
}: {
  readonly layer: CameraFrustumPanelLayer;
  readonly onTextureError?: (layerId: string, message: string | null) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const { cameraRayModel, frame, frameTransform, image } = layer;
  const requireCameraRayModel = layer.requireCameraRayModel === true;
  const objectTransform = useMemo(
    () => pointCloudObjectTransform(frameTransform),
    [frameTransform],
  );
  const configuredImagePlaneDepthM = layer.imagePlaneDepthM;
  const imagePlaneDepthM =
    typeof configuredImagePlaneDepthM === "number" &&
    isFinitePositiveNumber(configuredImagePlaneDepthM)
      ? configuredImagePlaneDepthM
      : DEFAULT_CAMERA_FRUSTUM_DEPTH_M;
  const baseOpacity =
    typeof layer.opacity === "number"
      ? clamp01(layer.opacity)
      : DEFAULT_CAMERA_FRUSTUM_OPACITY;
  // Geometries are keyed on the intrinsic VALUES, not message identity:
  // calibration messages re-arrive at image cadence carrying the same
  // intrinsics, and rebuilding (then disposing) GPU geometry per message
  // floods the renderer with dead pipelines. `frame` is deliberately
  // omitted from the deps (the lint disables below).
  const intrinsicsKey = [
    frame.K[0],
    frame.K[4],
    frame.K[2],
    frame.K[5],
    frame.width,
    frame.height,
    imagePlaneDepthM,
  ].join(",");
  const geometry = useMemo(
    () =>
      requireCameraRayModel && !cameraRayModel
        ? null
        : createCameraFrustumGeometry(frame, imagePlaneDepthM, cameraRayModel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cameraRayModel, intrinsicsKey, requireCameraRayModel],
  );
  const imagePlaneGeometry = useMemo(
    () =>
      requireCameraRayModel && !cameraRayModel
        ? null
        : createCameraImagePlaneGeometry(
            frame,
            imagePlaneDepthM,
            cameraRayModel,
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cameraRayModel, intrinsicsKey, requireCameraRayModel],
  );
  const axisGeometry = useMemo(
    () => createCameraAxisMarkerGeometry(imagePlaneDepthM),
    [imagePlaneDepthM],
  );
  const pickingEnabled = useScenePicking();
  const [hovered, setHovered] = useState(false);
  const interactive =
    Boolean(layer.onHover || layer.onSelect) && pickingEnabled;
  const hoveredRef = useRef(hovered);
  hoveredRef.current = hovered;
  const onHoverRef = useRef(layer.onHover);
  // Selected (linked camera tile focused) draws dashed; hover — direct
  // or echoed from the linked tile — draws solid in the highlight color.
  const selected = Boolean(layer.selected);
  const emphasized =
    selected || Boolean(layer.highlighted) || (hovered && interactive);
  const renderOpacity = emphasized
    ? CAMERA_FRUSTUM_HIGHLIGHT_OPACITY
    : baseOpacity;
  // Message identity for the image decode below: the shared texture key
  // when the layer carries one, else image content time, else the frame
  // object itself. Keying on identity instead of `image` survives playback
  // re-delivering the same message in new wrapper objects every batch.
  const imageIdentity =
    layer.imageTextureKey ?? layer.imageContentTimeNs ?? image;
  const {
    errorMessage: imageErrorMessage,
    handle: imageHandle,
    status: imageStatus,
  } = useImageTextureLease({
    decodeRunway: layer.imageDecodeRunway,
    enabled: Boolean(image),
    frame: image,
    identity: imageIdentity,
    onLoaded: () => invalidate(),
    textureKey: layer.imageTextureKey,
  });
  // This effect publishes image-plane failures without hiding the wireframe.
  useEffect(() => {
    const textureError =
      layer.imageUnavailableReason ??
      (imageStatus === "error"
        ? (imageErrorMessage ?? "Camera texture unavailable")
        : null);
    onTextureError?.(layer.id, textureError);
  }, [
    imageErrorMessage,
    imageStatus,
    layer.id,
    layer.imageUnavailableReason,
    onTextureError,
  ]);
  // This effect removes the layer's published texture failure on unmount.
  useEffect(
    () => () => {
      onTextureError?.(layer.id, null);
    },
    [layer.id, onTextureError],
  );
  // This effect disposes superseded wireframe geometry.
  useEffect(() => () => geometry?.dispose(), [geometry]);
  // This effect disposes superseded camera-image geometry.
  useEffect(() => () => imagePlaneGeometry?.dispose(), [imagePlaneGeometry]);
  // This effect disposes the camera-axis marker when it is replaced.
  useEffect(() => () => axisGeometry.dispose(), [axisGeometry]);
  // This effect clears an active frustum hover when the layer unmounts.
  useEffect(
    () => () => {
      if (hoveredRef.current) onHoverRef.current?.(false);
    },
    [],
  );
  // Transfer an active hover between callback instances without leaving the
  // previous owner stuck in its hovered state.
  useEffect(() => {
    if (onHoverRef.current === layer.onHover) return;
    onHoverRef.current?.(false);
    onHoverRef.current = layer.onHover;
    onHoverRef.current?.(hoveredRef.current);
  }, [layer.onHover]);
  // Pointer-out handlers disappear when picking or interactivity is disabled,
  // so clear the hover explicitly while the active callback is still known.
  useEffect(() => {
    if (interactive || !hoveredRef.current) return;
    hoveredRef.current = false;
    setHovered(false);
    onHoverRef.current?.(false);
  }, [interactive]);
  useInvalidateOn([
    axisGeometry,
    baseOpacity,
    emphasized,
    selected,
    geometry,
    imageHandle,
    imagePlaneGeometry,
    objectTransform,
  ]);

  // This effect shows a pointer cursor while a clickable frustum is
  // hovered; the canvas has no per-object cursor styling of its own.
  useEffect(() => {
    if (!hovered || !interactive) return undefined;
    const previous = document.body.style.cursor;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = previous;
    };
  }, [hovered, interactive]);

  // Cast, not a type: fiber's bundled three `Texture` type is out of sync
  // with the app's pinned three version — see GridSceneLayer's textureMap.
  const imageMap = imageHandle ? (imageHandle.texture as never) : null;
  if (!geometry) {
    return null;
  }

  return (
    <group
      position={objectTransform.position}
      quaternion={objectTransform.quaternion}
      onClick={
        interactive
          ? (event: ThreeEvent<MouseEvent>) => {
              if (event.delta > CLICK_DRAG_TOLERANCE_PX) return;
              event.stopPropagation();
              layer.onSelect?.({
                metaKey: event.nativeEvent.metaKey,
              });
            }
          : undefined
      }
      onPointerOver={
        interactive
          ? (event) => {
              event.stopPropagation();
              hoveredRef.current = true;
              setHovered(true);
              onHoverRef.current?.(true);
            }
          : undefined
      }
      onPointerOut={
        interactive
          ? () => {
              hoveredRef.current = false;
              setHovered(false);
              onHoverRef.current?.(false);
            }
          : undefined
      }
      userData={interactive ? POINT_PICK_BLOCKING_USER_DATA : undefined}
    >
      <lineSegments frustumCulled={false}>
        <primitive attach="geometry" object={geometry} />
        {selected ? (
          <lineDashedMaterial
            color={CAMERA_FRUSTUM_HIGHLIGHT_COLOR}
            dashSize={SCENE_SELECTED_DASH_SIZE}
            gapSize={SCENE_SELECTED_GAP_SIZE}
            opacity={CAMERA_FRUSTUM_HIGHLIGHT_OPACITY}
            transparent
          />
        ) : (
          <lineBasicMaterial
            color={
              emphasized ? CAMERA_FRUSTUM_HIGHLIGHT_COLOR : CAMERA_FRUSTUM_COLOR
            }
            opacity={
              emphasized ? CAMERA_FRUSTUM_HIGHLIGHT_OPACITY : baseOpacity
            }
            transparent
          />
        )}
      </lineSegments>
      <lineSegments frustumCulled={false}>
        <primitive attach="geometry" object={axisGeometry} />
        <lineBasicMaterial
          linewidth={CAMERA_FRUSTUM_AXIS_LINE_WIDTH}
          opacity={renderOpacity}
          transparent
          vertexColors
        />
      </lineSegments>
      {imageMap && imagePlaneGeometry ? (
        <mesh frustumCulled={false}>
          <primitive attach="geometry" object={imagePlaneGeometry} />
          <meshBasicMaterial
            map={imageMap}
            opacity={renderOpacity}
            side={THREE.DoubleSide}
            transparent
          />
        </mesh>
      ) : null}
    </group>
  );
});

/**
 * Image-corner directions for one camera in the OpenCV/Foxglove camera
 * convention (+Z forward, +X right, +Y down), at the fixed frustum depth.
 * Corners come straight from the intrinsic matrix so off-center principal
 * points render truthfully: corner = ((u - cx) / fx * d, (v - cy) / fy * d, d).
 * Order: top-left, top-right, bottom-right, bottom-left in image pixels.
 */
function cameraFrustumCorners(
  frame: CameraCalibrationVisualization,
  depth: number,
): readonly (readonly [number, number, number])[] | null {
  const fx = frame.K[0];
  const fy = frame.K[4];
  const cx = frame.K[2];
  const cy = frame.K[5];
  if (
    !isFinitePositiveNumber(fx) ||
    !isFinitePositiveNumber(fy) ||
    !Number.isFinite(cx) ||
    !Number.isFinite(cy) ||
    !isFinitePositiveNumber(frame.width) ||
    !isFinitePositiveNumber(frame.height)
  ) {
    return null;
  }

  const cornerPixels: readonly (readonly [number, number])[] = [
    [0, 0],
    [frame.width, 0],
    [frame.width, frame.height],
    [0, frame.height],
  ];

  return cornerPixels.map(
    ([u, v]) =>
      [((u - cx) / fx) * depth, ((v - cy) / fy) * depth, depth] as const,
  );
}

/**
 * Wireframe frustum for one camera: four rays from the optical center to
 * the image corners plus the far rectangle.
 */
export function createCameraFrustumGeometry(
  frame: CameraCalibrationVisualization,
  depth: number,
  rayModel?: CameraImageRayModel,
): THREE.BufferGeometry | null {
  if (rayModel) {
    const boundary = cameraRayBoundary(rayModel, depth);
    if (boundary.length < 4) {
      return null;
    }
    const segments: number[] = [];
    const quarter = Math.max(1, Math.floor(boundary.length / 4));
    for (const index of [0, quarter, quarter * 2, quarter * 3]) {
      const point = boundary[Math.min(index, boundary.length - 1)];
      segments.push(0, 0, 0, ...point);
    }
    for (let index = 0; index < boundary.length; index++) {
      const next = boundary[(index + 1) % boundary.length];
      segments.push(...boundary[index], ...next);
    }
    return lineGeometry(segments);
  }

  const corners = cameraFrustumCorners(frame, depth);
  if (!corners) {
    return null;
  }

  const segments: number[] = [];
  for (const corner of corners) {
    segments.push(0, 0, 0, ...corner);
  }
  for (let index = 0; index < corners.length; index++) {
    const next = corners[(index + 1) % corners.length];
    segments.push(...corners[index], ...next);
  }

  return lineGeometry(segments);
}

/**
 * Quad filling the frustum's far rectangle, UV-mapped so the camera's
 * image renders upright: image pixel row 0 (top) sits on the frustum's
 * top edge, matching the default `flipY` texture orientation.
 */
export function createCameraImagePlaneGeometry(
  frame: CameraCalibrationVisualization,
  depth: number,
  rayModel?: CameraImageRayModel,
): THREE.BufferGeometry | null {
  if (rayModel) {
    return createCameraRaySurfaceGeometry(rayModel, depth);
  }
  const corners = cameraFrustumCorners(frame, depth);
  if (!corners) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(Float32Array.from(corners.flat()), 3),
  );
  geometry.setAttribute(
    "uv",
    // Corner order TL, TR, BR, BL; flipY textures put image-top at v=1.
    new THREE.BufferAttribute(Float32Array.from([0, 1, 1, 1, 1, 0, 0, 0]), 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  return geometry;
}

function cameraRayBoundary(
  model: CameraImageRayModel,
  depth: number,
): readonly (readonly [number, number, number])[] {
  const points: Array<readonly [number, number, number]> = [];
  const width = Math.max(1, model.width - 1);
  const height = Math.max(1, model.height - 1);
  const append = (u: number, v: number) => {
    const point = cameraRayPoint(model.rayForPixel(u, v), depth);
    if (point) {
      points.push(point);
    }
  };
  for (let step = 0; step < CAMERA_BOUNDARY_SEGMENTS_PER_EDGE; step++) {
    append((width * step) / CAMERA_BOUNDARY_SEGMENTS_PER_EDGE, 0);
  }
  for (let step = 0; step < CAMERA_BOUNDARY_SEGMENTS_PER_EDGE; step++) {
    append(width, (height * step) / CAMERA_BOUNDARY_SEGMENTS_PER_EDGE);
  }
  for (let step = 0; step < CAMERA_BOUNDARY_SEGMENTS_PER_EDGE; step++) {
    append(width - (width * step) / CAMERA_BOUNDARY_SEGMENTS_PER_EDGE, height);
  }
  for (let step = 0; step < CAMERA_BOUNDARY_SEGMENTS_PER_EDGE; step++) {
    append(0, height - (height * step) / CAMERA_BOUNDARY_SEGMENTS_PER_EDGE);
  }
  return points;
}

function createCameraRaySurfaceGeometry(
  model: CameraImageRayModel,
  depth: number,
): THREE.BufferGeometry | null {
  const columns = CAMERA_SURFACE_COLUMNS;
  const rows = CAMERA_SURFACE_ROWS;
  const vertexCount = (columns + 1) * (rows + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const valid = new Uint8Array(vertexCount);
  for (let row = 0; row <= rows; row++) {
    const rowFraction = row / rows;
    for (let column = 0; column <= columns; column++) {
      const columnFraction = column / columns;
      const vertex = row * (columns + 1) + column;
      const point = cameraRayPoint(
        model.rayForPixel(
          (model.width - 1) * columnFraction,
          (model.height - 1) * rowFraction,
        ),
        depth,
      );
      if (!point) {
        continue;
      }
      positions.set(point, vertex * 3);
      uvs[vertex * 2] = columnFraction;
      uvs[vertex * 2 + 1] = 1 - rowFraction;
      valid[vertex] = 1;
    }
  }

  const indices: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const topLeft = row * (columns + 1) + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + columns + 1;
      const bottomRight = bottomLeft + 1;
      appendValidTriangle(indices, valid, topLeft, bottomLeft, topRight);
      appendValidTriangle(indices, valid, topRight, bottomLeft, bottomRight);
    }
  }
  if (indices.length === 0) {
    return null;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function cameraRayPoint(
  ray: readonly [number, number, number] | null,
  depth: number,
): readonly [number, number, number] | null {
  if (!ray) {
    return null;
  }
  const length = Math.hypot(ray[0], ray[1], ray[2]);
  if (!(length > 1e-9) || !Number.isFinite(length)) {
    return null;
  }
  const scale = depth / length;
  return [ray[0] * scale, ray[1] * scale, ray[2] * scale];
}

function appendValidTriangle(
  indices: number[],
  valid: Uint8Array,
  first: number,
  second: number,
  third: number,
): void {
  if (valid[first] && valid[second] && valid[third]) {
    indices.push(first, second, third);
  }
}

function lineGeometry(segments: readonly number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(Float32Array.from(segments), 3),
  );
  // Line distances for the dashed selected style; harmless otherwise.
  return withLineDistances(geometry);
}

function createCameraAxisMarkerGeometry(depth: number): THREE.BufferGeometry {
  const length = depth * CAMERA_FRUSTUM_AXIS_LENGTH_RATIO;
  const positions = Float32Array.from([
    0,
    0,
    0,
    length,
    0,
    0,
    0,
    0,
    0,
    0,
    length,
    0,
    0,
    0,
    0,
    0,
    0,
    length,
  ]);
  const colors = Float32Array.from([
    1, 0.15, 0.15, 1, 0.15, 0.15, 0.2, 0.95, 0.25, 0.2, 0.95, 0.25, 0.25, 0.45,
    1, 0.25, 0.45, 1,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}
