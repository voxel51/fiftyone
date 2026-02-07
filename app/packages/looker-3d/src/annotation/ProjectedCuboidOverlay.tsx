/**
 * Overlay that projects the selected 3D cuboid onto a 2D image slice
 * using camera intrinsics and extrinsics.
 */

import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { staticTransformToMatrix4 } from "../frustum/builders";
import type { CameraIntrinsics, FrustumData } from "../frustum/types";
import {
  current3dAnnotationModeAtom,
  selectedLabelForAnnotationAtom,
} from "../state";
import { useRenderDetection } from "./store/renderModel";

const OverlaySvg = styled.svg`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
`;

// 12 edges of a cuboid, as pairs of corner indices
const CUBOID_EDGES: [number, number][] = [
  // bottom face
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  // top face
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  // verticals
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/**
 * Compute the 8 world-space corners of a cuboid.
 */
function getCuboidWorldCorners(
  location: [number, number, number],
  dimensions: [number, number, number],
  rotation?: [number, number, number],
  quaternion?: [number, number, number, number]
): Vector3[] {
  const [w, h, d] = dimensions;
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;

  const corners = [
    new Vector3(-hw, -hh, -hd),
    new Vector3(+hw, -hh, -hd),
    new Vector3(+hw, +hh, -hd),
    new Vector3(-hw, +hh, -hd),
    new Vector3(-hw, -hh, +hd),
    new Vector3(+hw, -hh, +hd),
    new Vector3(+hw, +hh, +hd),
    new Vector3(-hw, +hh, +hd),
  ];

  let q: Quaternion;
  if (quaternion) {
    q = new Quaternion(
      quaternion[0],
      quaternion[1],
      quaternion[2],
      quaternion[3]
    );
  } else if (rotation) {
    q = new Quaternion().setFromEuler(
      new Euler(rotation[0], rotation[1], rotation[2])
    );
  } else {
    q = new Quaternion();
  }

  const center = new Vector3(location[0], location[1], location[2]);

  return corners.map((c) => {
    c.applyQuaternion(q);
    c.add(center);
    return c;
  });
}

/**
 * Project a world-space point to pixel coordinates using camera extrinsics + intrinsics.
 */
function projectToPixel(
  worldPoint: Vector3,
  worldToCam: Matrix4,
  intrinsics: CameraIntrinsics
): { u: number; v: number; z: number } | null {
  const camPt = worldPoint.clone().applyMatrix4(worldToCam);

  // point must be in front of camera (z > 0 in CV convention)
  if (camPt.z <= 0) return null;

  const u = intrinsics.fx * (camPt.x / camPt.z) + intrinsics.cx;
  const v = intrinsics.fy * (camPt.y / camPt.z) + intrinsics.cy;

  return { u, v, z: camPt.z };
}

interface ProjectedCuboidOverlayProps {
  frustumData: FrustumData;
}

export function ProjectedCuboidOverlay({
  frustumData,
}: ProjectedCuboidOverlayProps) {
  const selectedLabel = useRecoilValue(selectedLabelForAnnotationAtom);
  const annotationMode = useRecoilValue(current3dAnnotationModeAtom);

  // Get the working-store version of the detection (includes edits)
  const renderDetection = useRenderDetection(selectedLabel?._id ?? "");

  const projectedEdges = useMemo(() => {
    if (!selectedLabel || annotationMode !== "cuboid") return null;
    if (!frustumData.intrinsics || !frustumData.staticTransform) return null;

    const { intrinsics, staticTransform } = frustumData;

    // Need image dimensions for the viewBox
    const imgW = intrinsics.width ?? Math.round(intrinsics.cx * 2);
    const imgH = intrinsics.height ?? Math.round(intrinsics.cy * 2);
    if (!imgW || !imgH) return null;

    // Prefer working-store detection (reflects edits), fall back to raw label
    const label = renderDetection ?? (selectedLabel as any);
    if (!label.location || !label.dimensions) return null;

    const corners = getCuboidWorldCorners(
      label.location,
      label.dimensions,
      label.rotation,
      label.quaternion
    );

    // staticTransform is camera-to-world; invert to get world-to-camera
    const camToWorld = staticTransformToMatrix4(staticTransform);
    const worldToCam = camToWorld.clone().invert();

    const projected = corners.map((c) =>
      projectToPixel(c, worldToCam, intrinsics)
    );

    const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const [i, j] of CUBOID_EDGES) {
      const p1 = projected[i];
      const p2 = projected[j];
      if (p1 && p2) {
        edges.push({ x1: p1.u, y1: p1.v, x2: p2.u, y2: p2.v });
      }
    }

    return { edges, width: imgW, height: imgH, corners: projected };
  }, [selectedLabel, annotationMode, frustumData, renderDetection]);

  if (!projectedEdges || projectedEdges.edges.length === 0) return null;

  const color = (selectedLabel as any)?.color ?? "#00ff00";

  return (
    <OverlaySvg
      viewBox={`0 0 ${projectedEdges.width} ${projectedEdges.height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {projectedEdges.edges.map((e, i) => (
        <line
          key={i}
          x1={e.x1}
          y1={e.y1}
          x2={e.x2}
          y2={e.y2}
          stroke={color}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
      ))}
      {projectedEdges.corners.map((p, i) =>
        p ? (
          <circle
            key={`v-${i}`}
            cx={p.u}
            cy={p.v}
            r={3}
            fill={color}
            vectorEffect="non-scaling-stroke"
          />
        ) : null
      )}
    </OverlaySvg>
  );
}
