/**
 * Single frustum component that renders wireframe edges and a clickable far plane.
 */

import { Line } from "@react-three/drei";
import { ThreeEvent, useLoader } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  TextureLoader,
  Vector3,
} from "three";
import { useFo3dContext } from "../fo3d/context";
import { formatNumber, quaternionToEuler } from "../utils";
import {
  FRUSTUM_AXES_LINE_WIDTH,
  FRUSTUM_AXES_SIZE,
  FRUSTUM_COLOR,
  FRUSTUM_HOVER_COLOR,
  FRUSTUM_HOVER_OPACITY,
  FRUSTUM_LINE_WIDTH,
  FRUSTUM_PLANE_OPACITY,
} from "./state";
import type { CameraExtrinsics, FrustumData, FrustumGeometry } from "./types";
import { useFoLoader } from "../hooks/use-fo-loaders";

/**
 * Formats extrinsics data for display in tooltip.
 */
function formatExtrinsicsForTooltip(
  extrinsics: CameraExtrinsics
): Record<string, string> {
  const [tx, ty, tz] = extrinsics.translation;
  const [qx, qy, qz, qw] = extrinsics.quaternion;
  const euler = quaternionToEuler(extrinsics.quaternion);

  return {
    position: `[${formatNumber(tx)}, ${formatNumber(ty)}, ${formatNumber(tz)}]`,
    quaternion: `[${formatNumber(qx, 4)}, ${formatNumber(
      qy,
      4
    )}, ${formatNumber(qz, 4)}, ${formatNumber(qw, 4)}]`,
    rotation: `[${formatNumber(euler[0], 1)}°, ${formatNumber(
      euler[1],
      1
    )}°, ${formatNumber(euler[2], 1)}°]`,
  };
}

interface FrustumProps {
  /** Frustum data including slice name and optional texture details */
  frustumData: FrustumData;
  /** Computed geometry for rendering */
  geometry: FrustumGeometry;
}

/**
 * Renders a single camera frustum with:
 * - Wireframe edges (always visible)
 * - Semi-transparent far plane (for click interaction)
 * - Optional image texture on far plane (when clicked, if intrinsics available)
 */
export function Frustum({ frustumData, geometry }: FrustumProps) {
  const { sliceName, intrinsics, imageUrl } = frustumData;
  const { setHoverMetadata } = useFo3dContext();
  const [showTexture, setShowTexture] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Only load texture if we have intrinsics and an image URL
  const canShowTexture = Boolean(intrinsics && imageUrl);

  // Compute colors based on hover state
  const wireframeColor = isHovered ? FRUSTUM_HOVER_COLOR : FRUSTUM_COLOR;
  const planeOpacity = isHovered
    ? FRUSTUM_HOVER_OPACITY
    : FRUSTUM_PLANE_OPACITY;

  // Build wireframe line points from geometry
  const linePoints = useMemo(() => {
    const points: Vector3[] = [];
    const { corners, lineIndices } = geometry;

    for (let i = 0; i < lineIndices.length; i += 2) {
      const idx1 = lineIndices[i];
      const idx2 = lineIndices[i + 1];

      points.push(
        new Vector3(
          corners[idx1 * 3],
          corners[idx1 * 3 + 1],
          corners[idx1 * 3 + 2]
        )
      );
      points.push(
        new Vector3(
          corners[idx2 * 3],
          corners[idx2 * 3 + 1],
          corners[idx2 * 3 + 2]
        )
      );
    }

    return points;
  }, [geometry]);

  const farPlaneGeometry = useMemo(() => {
    const geo = new BufferGeometry();
    const { farPlaneCorners } = geometry;

    // Create vertices for two triangles forming a quad
    // Order: top-left, top-right, bottom-right, bottom-left
    const vertices = new Float32Array([
      // Triangle 1: top-left, top-right, bottom-right
      ...farPlaneCorners[0],
      ...farPlaneCorners[1],
      ...farPlaneCorners[2],
      // Triangle 2: top-left, bottom-right, bottom-left
      ...farPlaneCorners[0],
      ...farPlaneCorners[2],
      ...farPlaneCorners[3],
    ]);

    // UV coordinates for texture mapping
    const uvs = new Float32Array([
      // Triangle 1
      0,
      1, // top-left
      1,
      1, // top-right
      1,
      0, // bottom-right
      // Triangle 2
      0,
      1, // top-left
      1,
      0, // bottom-right
      0,
      0, // bottom-left
    ]);

    geo.setAttribute("position", new BufferAttribute(vertices, 3));
    geo.setAttribute("uv", new BufferAttribute(uvs, 2));
    geo.computeVertexNormals();

    return geo;
  }, [geometry]);

  // Cleanup geometry on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      farPlaneGeometry.dispose();
    };
  }, [farPlaneGeometry]);

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setIsHovered(true);

      // Build attributes with extrinsics info
      const attributes: Record<string, string | number | boolean> = {
        slice: sliceName,
      };

      // Add extrinsics data if available
      if (frustumData.extrinsics) {
        const extrinsicsInfo = formatExtrinsicsForTooltip(
          frustumData.extrinsics
        );
        attributes.position = extrinsicsInfo.position;
        attributes.quaternion = extrinsicsInfo.quaternion;
        attributes.rotation = extrinsicsInfo.rotation;
      }

      setHoverMetadata({
        assetName: `Camera: ${sliceName}`,
        renderModeDescriptor: "Frustum",
        attributes,
      });
    },
    [sliceName, frustumData.extrinsics, setHoverMetadata]
  );

  const handlePointerOut = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setIsHovered(false);
      setHoverMetadata(null);
    },
    [setHoverMetadata]
  );

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (canShowTexture) {
        setShowTexture((prev) => !prev);
      }
    },
    [canShowTexture]
  );

  const axisOrigin = new Vector3(0, 0, 0);
  const xAxisEnd = new Vector3(FRUSTUM_AXES_SIZE, 0, 0);
  const yAxisEnd = new Vector3(0, FRUSTUM_AXES_SIZE, 0);
  const zAxisEnd = new Vector3(0, 0, FRUSTUM_AXES_SIZE);

  return (
    <group matrix={geometry.transform} matrixAutoUpdate={false}>
      <Line
        points={[axisOrigin, xAxisEnd]}
        color="#ff0000"
        lineWidth={FRUSTUM_AXES_LINE_WIDTH}
      />
      <Line
        points={[axisOrigin, yAxisEnd]}
        color="#00ff00"
        lineWidth={FRUSTUM_AXES_LINE_WIDTH}
      />
      <Line
        points={[axisOrigin, zAxisEnd]}
        color="#0000ff"
        lineWidth={FRUSTUM_AXES_LINE_WIDTH}
      />

      {/* Wireframe edges */}
      <Line
        points={linePoints}
        color={wireframeColor}
        lineWidth={FRUSTUM_LINE_WIDTH}
        segments
      />

      {/* Far plane (clickable) */}
      <mesh
        geometry={farPlaneGeometry}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        {showTexture && imageUrl ? (
          <FrustumTextureMaterial imageUrl={imageUrl} />
        ) : (
          <meshBasicMaterial
            color={wireframeColor}
            opacity={planeOpacity}
            transparent
            side={DoubleSide}
            depthWrite={false}
          />
        )}
      </mesh>
    </group>
  );
}

/**
 * Separate component for texture material to handle async texture loading.
 */
function FrustumTextureMaterial({ imageUrl }: { imageUrl: string }) {
  const texture = useFoLoader(TextureLoader, imageUrl);

  return (
    <meshBasicMaterial
      map={texture}
      transparent
      opacity={0.9}
      side={DoubleSide}
      depthWrite={false}
    />
  );
}
