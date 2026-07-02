/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { CameraCalibrationVisualization } from "../../../decoders";
import type { ImageTextureHandle } from "../base-2d-scene";
import { createImageTexture } from "../image-texture";
import { pointCloudObjectTransform } from "./transforms";
import type { CameraFrustumPanelLayer } from "./types";
import { isFinitePositiveNumber } from "./utils";

// Camera frustum wireframes: fixed apex-to-image-plane depth in meters.
// Purely presentational — the value is not data, which is also why
// frustums never participate in camera-fit bounds. Sized so the image
// planes read at vehicle scale next to LiDAR returns.
const CAMERA_FRUSTUM_DEPTH_M = 2.5;
const CAMERA_FRUSTUM_COLOR = 0xffaa33;
const CAMERA_FRUSTUM_OPACITY = 0.85;

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
  ].join(",");
  const geometry = useMemo(
    () => createCameraFrustumGeometry(frame),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [intrinsicsKey],
  );
  const imagePlaneGeometry = useMemo(
    () => createCameraImagePlaneGeometry(frame),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [intrinsicsKey],
  );
  const [imageHandle, setImageHandle] = useState<ImageTextureHandle | null>(
    null,
  );
  const imageHandleRef = useRef<ImageTextureHandle | null>(null);
  const replaceImageHandle = useCallback((next: ImageTextureHandle | null) => {
    const previous = imageHandleRef.current;
    if (previous && previous !== next) {
      previous.dispose();
    }
    imageHandleRef.current = next;
    setImageHandle(next);
  }, []);

  // This effect decodes the camera's current encoded frame into the image
  // plane texture. It is keyed on message identity (layer id + image
  // content time) for the same batch-redelivery reason as the geometries,
  // so `image` is deliberately omitted from the deps.
  useEffect(() => {
    if (!image || image.bytes.byteLength === 0) {
      replaceImageHandle(null);
      return undefined;
    }

    let cancelled = false;
    createImageTexture(image.bytes, image.mimeType)
      .then((handle) => {
        if (cancelled) {
          handle.dispose();
          return;
        }
        replaceImageHandle(handle);
        invalidate();
      })
      .catch(() => {
        if (!cancelled) {
          replaceImageHandle(null);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalidate, layer.id, layer.imageContentTimeNs ?? image]);

  useEffect(
    () => () => {
      imageHandleRef.current?.dispose();
      imageHandleRef.current = null;
    },
    [],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => imagePlaneGeometry?.dispose(), [imagePlaneGeometry]);
  useEffect(() => {
    invalidate();
  }, [geometry, imageHandle, imagePlaneGeometry, invalidate, objectTransform]);

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
    >
      <lineSegments frustumCulled={false}>
        <primitive attach="geometry" object={geometry} />
        <lineBasicMaterial
          color={CAMERA_FRUSTUM_COLOR}
          opacity={CAMERA_FRUSTUM_OPACITY}
          transparent
        />
      </lineSegments>
      {imageMap && imagePlaneGeometry ? (
        <mesh frustumCulled={false}>
          <primitive attach="geometry" object={imagePlaneGeometry} />
          <meshBasicMaterial map={imageMap} side={THREE.DoubleSide} />
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

  const depth = CAMERA_FRUSTUM_DEPTH_M;
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
): THREE.BufferGeometry | null {
  const corners = cameraFrustumCorners(frame);
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
): THREE.BufferGeometry | null {
  const corners = cameraFrustumCorners(frame);
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
