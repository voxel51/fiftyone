import { Cone, Line } from "@react-three/drei";
import { ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  TextureLoader,
  Vector3,
} from "three";
import { useFo3dContext } from "../fo3d/context";
import { useFoLoader } from "../hooks/use-fo-loaders";
import { formatNumber, quaternionToEuler } from "../utils";
import {
  FRUSTUM_AXES_LINE_WIDTH,
  FRUSTUM_AXES_SIZE,
  FRUSTUM_AXIS_ARROW_HEIGHT,
  FRUSTUM_AXIS_ARROW_RADIUS,
  FRUSTUM_AXIS_X_COLOR,
  FRUSTUM_AXIS_Y_COLOR,
  FRUSTUM_AXIS_Z_COLOR,
  FRUSTUM_COLOR,
  FRUSTUM_HOVER_COLOR,
  FRUSTUM_HOVER_OPACITY,
  FRUSTUM_LINE_WIDTH,
  FRUSTUM_PLANE_OPACITY,
  FRUSTUM_TEXTURE_HOVER_OPACITY,
  FRUSTUM_TEXTURE_OPACITY,
  FRUSTUM_TOP_MARKER_BASE_HALF_WIDTH,
  FRUSTUM_TOP_MARKER_HEIGHT,
} from "./constants";
import type { FrustumData, FrustumGeometry, StaticTransform } from "./types";

function formatStaticTransformForTooltip(
  staticTransform: StaticTransform
): Record<string, string> {
  const [tx, ty, tz] = staticTransform.translation;
  const [qx, qy, qz, qw] = staticTransform.quaternion;
  const euler = quaternionToEuler(staticTransform.quaternion);

  return {
    position: `${formatNumber(tx)}, ${formatNumber(ty)}, ${formatNumber(tz)}`,
    quaternion: `${formatNumber(qx, 4)}, ${formatNumber(qy, 4)}, ${formatNumber(
      qz,
      4
    )}, ${formatNumber(qw, 4)}`,
    rotation: `${formatNumber(euler[0], 1)}°, ${formatNumber(
      euler[1],
      1
    )}°, ${formatNumber(euler[2], 1)}°`,
  };
}

interface FrustumProps {
  frustumData: FrustumData;
  geometry: FrustumGeometry;
}

export function Frustum({ frustumData, geometry }: FrustumProps) {
  const { sliceName, intrinsics, imageUrl } = frustumData;
  const { setHoverMetadata } = useFo3dContext();
  const [showTexture, setShowTexture] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  const canShowTexture = Boolean(intrinsics && imageUrl);
  const wireframeColor = isHovered ? FRUSTUM_HOVER_COLOR : FRUSTUM_COLOR;
  const planeOpacity = isHovered
    ? FRUSTUM_HOVER_OPACITY
    : FRUSTUM_PLANE_OPACITY;

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

    const vertices = new Float32Array([
      ...farPlaneCorners[0],
      ...farPlaneCorners[1],
      ...farPlaneCorners[2],
      ...farPlaneCorners[0],
      ...farPlaneCorners[2],
      ...farPlaneCorners[3],
    ]);

    const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0]);

    geo.setAttribute("position", new BufferAttribute(vertices, 3));
    geo.setAttribute("uv", new BufferAttribute(uvs, 2));
    geo.computeVertexNormals();

    return geo;
  }, [geometry]);

  const topMarkerPoints = useMemo(() => {
    const { farPlaneCorners } = geometry;
    const topLeft = new Vector3(...farPlaneCorners[0]);
    const topRight = new Vector3(...farPlaneCorners[1]);

    const topMidpoint = topLeft.clone().add(topRight).multiplyScalar(0.5);
    const edgeWidth = topLeft.distanceTo(topRight);
    const baseHalfWidth = edgeWidth * FRUSTUM_TOP_MARKER_BASE_HALF_WIDTH;
    const edgeDirection = topRight.clone().sub(topLeft).normalize();

    const baseLeft = topMidpoint
      .clone()
      .sub(edgeDirection.clone().multiplyScalar(baseHalfWidth));
    const baseRight = topMidpoint
      .clone()
      .add(edgeDirection.clone().multiplyScalar(baseHalfWidth));

    const apexHeight = edgeWidth * FRUSTUM_TOP_MARKER_HEIGHT;
    const apex = topMidpoint.clone();
    apex.y -= apexHeight;

    return [baseLeft, apex, baseRight, baseLeft];
  }, [geometry]);

  useEffect(() => {
    return () => {
      farPlaneGeometry.dispose();
    };
  }, [farPlaneGeometry]);

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setIsHovered(true);

      const attributes: Record<string, string | number | boolean> = {};

      if (frustumData.staticTransform) {
        const transformInfo = formatStaticTransformForTooltip(
          frustumData.staticTransform
        );
        attributes.position = transformInfo.position;
        attributes.quaternion = transformInfo.quaternion;
        attributes.rotation = transformInfo.rotation;
      }

      setHoverMetadata({
        assetName: `Camera: ${sliceName}`,
        renderModeDescriptor: "Frustum",
        attributes,
      });
    },
    [sliceName, frustumData.staticTransform, setHoverMetadata]
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
      {/* X axis */}
      <Line
        points={[axisOrigin, xAxisEnd]}
        color={FRUSTUM_AXIS_X_COLOR}
        lineWidth={FRUSTUM_AXES_LINE_WIDTH}
      />
      {isHovered && (
        <Cone
          args={[FRUSTUM_AXIS_ARROW_RADIUS, FRUSTUM_AXIS_ARROW_HEIGHT, 8]}
          position={[FRUSTUM_AXES_SIZE + FRUSTUM_AXIS_ARROW_HEIGHT / 2, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
        >
          <meshBasicMaterial color={FRUSTUM_AXIS_X_COLOR} />
        </Cone>
      )}

      {/* Y axis */}
      <Line
        points={[axisOrigin, yAxisEnd]}
        color={FRUSTUM_AXIS_Y_COLOR}
        lineWidth={FRUSTUM_AXES_LINE_WIDTH}
      />
      {isHovered && (
        <Cone
          args={[FRUSTUM_AXIS_ARROW_RADIUS, FRUSTUM_AXIS_ARROW_HEIGHT, 8]}
          position={[0, FRUSTUM_AXES_SIZE + FRUSTUM_AXIS_ARROW_HEIGHT / 2, 0]}
          rotation={[0, 0, 0]}
        >
          <meshBasicMaterial color={FRUSTUM_AXIS_Y_COLOR} />
        </Cone>
      )}

      {/* Z axis */}
      <Line
        points={[axisOrigin, zAxisEnd]}
        color={FRUSTUM_AXIS_Z_COLOR}
        lineWidth={FRUSTUM_AXES_LINE_WIDTH}
      />
      {isHovered && (
        <Cone
          args={[FRUSTUM_AXIS_ARROW_RADIUS, FRUSTUM_AXIS_ARROW_HEIGHT, 8]}
          position={[0, 0, FRUSTUM_AXES_SIZE + FRUSTUM_AXIS_ARROW_HEIGHT / 2]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <meshBasicMaterial color={FRUSTUM_AXIS_Z_COLOR} />
        </Cone>
      )}

      {/* Wireframe edges */}
      <Line
        points={linePoints}
        color={wireframeColor}
        lineWidth={FRUSTUM_LINE_WIDTH}
        segments
      />

      {/* Top marker */}
      <Line
        points={topMarkerPoints}
        color={wireframeColor}
        lineWidth={FRUSTUM_LINE_WIDTH}
      />

      <mesh
        geometry={farPlaneGeometry}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        renderOrder={isHovered && showTexture ? 1 : 0}
      >
        {showTexture && imageUrl ? (
          <FrustumTextureMaterial imageUrl={imageUrl} isHovered={isHovered} />
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

function FrustumTextureMaterial({
  imageUrl,
  isHovered,
}: {
  imageUrl: string;
  isHovered: boolean;
}) {
  const texture = useFoLoader(TextureLoader, imageUrl);
  const opacity = isHovered
    ? FRUSTUM_TEXTURE_HOVER_OPACITY
    : FRUSTUM_TEXTURE_OPACITY;

  return (
    <meshBasicMaterial
      map={texture}
      transparent
      opacity={opacity}
      side={DoubleSide}
      depthWrite={false}
    />
  );
}
