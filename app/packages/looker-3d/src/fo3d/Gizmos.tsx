import { GizmoHelper, GizmoViewport } from "@react-three/drei";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { Box3, Vector3 } from "three";
import { VOXEL51_THEME_COLOR } from "../constants";
import { isGridOnAtom } from "../state";
import { getGridQuaternionFromUpVector } from "../utils";

const OriginHelper = () => {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.02, 16, 16]} />
        <meshBasicMaterial
          color={VOXEL51_THEME_COLOR}
          opacity={0.2}
          transparent
        />
      </mesh>
    </group>
  );
};

export const Gizmos = ({
  sceneBoundingBox,
  upVector,
}: {
  sceneBoundingBox: Box3;
  upVector: Vector3;
}) => {
  const isGridOn = useRecoilValue(isGridOnAtom);

  const gridHelperQuarternion = useMemo(
    () => getGridQuaternionFromUpVector(upVector),
    [upVector]
  );

  const [gridSize, numGridLines] = useMemo(() => {
    if (
      !sceneBoundingBox ||
      Math.abs(sceneBoundingBox.max.x) === Infinity ||
      !upVector
    ) {
      return [100, 100];
    }

    let maxInOrthoNormalPlane: number;

    // account for the possibility that the scene is not centered at the origin
    let offset: number;

    if (upVector.x === 1) {
      maxInOrthoNormalPlane = Math.max(
        sceneBoundingBox.max.y - sceneBoundingBox.min.y,
        sceneBoundingBox.max.z - sceneBoundingBox.min.z
      );
      offset = Math.max(
        sceneBoundingBox.max.y,
        Math.abs(sceneBoundingBox.min.y),
        sceneBoundingBox.max.z,
        Math.abs(sceneBoundingBox.min.z)
      );
    } else if (upVector.y === 1) {
      maxInOrthoNormalPlane = Math.max(
        sceneBoundingBox.max.x - sceneBoundingBox.min.x,
        sceneBoundingBox.max.z - sceneBoundingBox.min.z
      );
      offset = Math.max(
        sceneBoundingBox.max.x,
        Math.abs(sceneBoundingBox.min.x),
        sceneBoundingBox.max.z,
        Math.abs(sceneBoundingBox.min.z)
      );
    } else {
      maxInOrthoNormalPlane = Math.max(
        sceneBoundingBox.max.x - sceneBoundingBox.min.x,
        sceneBoundingBox.max.y - sceneBoundingBox.min.y
      );
      offset = Math.max(
        sceneBoundingBox.max.x,
        Math.abs(sceneBoundingBox.min.x),
        sceneBoundingBox.max.y,
        Math.abs(sceneBoundingBox.min.y)
      );
    }

    // add 20% padding
    // 2.5 is an arbitrary multiplier for offset
    const gridSize = Math.ceil(maxInOrthoNormalPlane * 1.2) + offset * 2.5;
    const numLines = Math.ceil(gridSize);

    return [gridSize, numLines];
  }, [sceneBoundingBox, upVector]);

  return (
    <>
      {isGridOn && (
        <gridHelper
          args={[gridSize, numGridLines]}
          quaternion={gridHelperQuarternion}
        />
      )}
      <GizmoHelper alignment="top-left" margin={[80, 100]}>
        <GizmoViewport />
      </GizmoHelper>
      <OriginHelper />
    </>
  );
};
