/* eslint-disable react/no-unknown-property */
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { CameraCalibrationVisualization } from "../../../decoders";
import type { ImageTextureHandle } from "../base-2d-scene";
import { createImageTexture } from "../image-texture";
import {
  acquireImageTexture,
  type ImageTextureLease,
} from "../image-texture-cache";
import { useScenePicking } from "./scene-interactivity";
import { pointCloudObjectTransform } from "./transforms";
import type { CameraFrustumPanelLayer } from "./types";
import { clamp01, isFinitePositiveNumber } from "./utils";

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
// A click that traveled further than this (pointer-down → pointer-up, px)
// is an orbit drag, not a pick.
const FRUSTUM_CLICK_DRAG_TOLERANCE_PX = 4;

export function CameraFrustumSceneLayer({
  layer,
}: {
  readonly layer: CameraFrustumPanelLayer;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const { frame, frameTransform, image } = layer;
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
    () => createCameraFrustumGeometry(frame, imagePlaneDepthM),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [intrinsicsKey],
  );
  const imagePlaneGeometry = useMemo(
    () => createCameraImagePlaneGeometry(frame, imagePlaneDepthM),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [intrinsicsKey],
  );
  const axisGeometry = useMemo(
    () => createCameraAxisMarkerGeometry(imagePlaneDepthM),
    [imagePlaneDepthM],
  );
  const [imageHandle, setImageHandle] = useState<ImageTextureHandle | null>(
    null,
  );
  const pickingEnabled = useScenePicking();
  const [hovered, setHovered] = useState(false);
  const interactive = Boolean(layer.onSelect) && pickingEnabled;
  const emphasized = Boolean(layer.highlighted) || (hovered && interactive);
  const renderOpacity = emphasized
    ? CAMERA_FRUSTUM_HIGHLIGHT_OPACITY
    : baseOpacity;
  const heldImageRef = useRef<{
    readonly handle: ImageTextureHandle;
    readonly release: ImageTextureLease["release"];
  } | null>(null);
  const replaceHeldImage = useCallback(
    (
      next: {
        readonly handle: ImageTextureHandle;
        readonly release: ImageTextureLease["release"];
      } | null,
    ) => {
      const previous = heldImageRef.current;
      if (previous && previous !== next) {
        previous.release();
      }
      heldImageRef.current = next;
      setImageHandle(next?.handle ?? null);
    },
    [],
  );

  // Message identity for the image decode below: the shared texture key
  // when the layer carries one, else image content time, else the frame
  // object itself. Keying on identity instead of `image` survives playback
  // re-delivering the same message in new wrapper objects every batch.
  const imageIdentity =
    layer.imageTextureKey ?? layer.imageContentTimeNs ?? image;

  // This effect resolves the camera's current encoded frame into the image
  // plane texture. When the layer carries `imageTextureKey` the decode goes
  // through the shared image-texture cache — the 2D image tile forms the
  // same key, so both surfaces share one decode and one GPU texture, and
  // replaced frames release their lease (retained for instant re-acquire)
  // instead of disposing. Layers without a key fall back to a private
  // decode per message. The effect is keyed on `imageIdentity`, not the
  // `image` wrapper, for the same batch-redelivery reason as the
  // geometries, so `image` is deliberately omitted from the deps.
  useEffect(() => {
    if (!image || image.bytes.byteLength === 0) {
      replaceHeldImage(null);
      return undefined;
    }

    let cancelled = false;
    const lease = acquireImageTexture(layer.imageTextureKey, () =>
      createImageTexture(image.bytes, image.mimeType),
    );
    lease.promise
      .then((handle) => {
        if (cancelled) {
          lease.release();
          return;
        }
        replaceHeldImage({ handle, release: lease.release });
        invalidate();
      })
      .catch(() => {
        lease.release();
        if (!cancelled) {
          replaceHeldImage(null);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalidate, layer.id, imageIdentity]);

  // This effect releases the held image lease on unmount — release, not
  // dispose: the texture may be shared with the 2D image tile and stays
  // retained by the cache for instant re-acquire.
  useEffect(
    () => () => {
      heldImageRef.current?.release();
      heldImageRef.current = null;
    },
    [],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => imagePlaneGeometry?.dispose(), [imagePlaneGeometry]);
  useEffect(() => () => axisGeometry.dispose(), [axisGeometry]);
  useEffect(() => {
    invalidate();
  }, [
    axisGeometry,
    baseOpacity,
    emphasized,
    geometry,
    imageHandle,
    imagePlaneGeometry,
    invalidate,
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

  if (!geometry) {
    return null;
  }

  // Cast, not a type: fiber's bundled three `Texture` type is out of sync
  // with the app's pinned three version — see GridSceneLayer's textureMap.
  const imageMap = imageHandle ? (imageHandle.texture as never) : null;

  return (
    <group
      position={objectTransform.position}
      quaternion={objectTransform.quaternion}
      onClick={
        interactive
          ? (event: ThreeEvent<MouseEvent>) => {
              if (event.delta > FRUSTUM_CLICK_DRAG_TOLERANCE_PX) return;
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
              setHovered(true);
            }
          : undefined
      }
      onPointerOut={interactive ? () => setHovered(false) : undefined}
    >
      <lineSegments frustumCulled={false}>
        <primitive attach="geometry" object={geometry} />
        <lineBasicMaterial
          color={
            emphasized ? CAMERA_FRUSTUM_HIGHLIGHT_COLOR : CAMERA_FRUSTUM_COLOR
          }
          opacity={emphasized ? CAMERA_FRUSTUM_HIGHLIGHT_OPACITY : baseOpacity}
          transparent
        />
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
}

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
function createCameraFrustumGeometry(
  frame: CameraCalibrationVisualization,
  depth: number,
): THREE.BufferGeometry | null {
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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(Float32Array.from(segments), 3),
  );

  return geometry;
}

/**
 * Quad filling the frustum's far rectangle, UV-mapped so the camera's
 * image renders upright: image pixel row 0 (top) sits on the frustum's
 * top edge, matching the default `flipY` texture orientation.
 */
function createCameraImagePlaneGeometry(
  frame: CameraCalibrationVisualization,
  depth: number,
): THREE.BufferGeometry | null {
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
