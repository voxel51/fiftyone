import { GizmoHelper, GizmoViewport } from "@react-three/drei";
import { useLayoutEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { Box3, Group, Vector3 } from "three";
import { VOXEL51_THEME_COLOR } from "../constants";
import { isGridOnAtom } from "../state";
import { getGridQuaternionFromUpVector } from "../utils";
import { Lights } from "./Lights";

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

export const Fo3dEnvironment = ({
  assetsGroupRef,
  sceneBoundingBox,
  setSceneBoundingBox,
  upVector,
}: {
  assetsGroupRef: React.RefObject<Group>;
  sceneBoundingBox: Box3;
  upVector: Vector3;
  setSceneBoundingBox: (box: Box3) => void;
}) => {
  const isGridOn = useRecoilValue(isGridOnAtom);

  const gridHelperQuarternion = useMemo(
    () => getGridQuaternionFromUpVector(upVector),
    [upVector]
  );

  useLayoutEffect(() => {
    const getBoundingBox = () => {
      if (!assetsGroupRef.current) {
        return;
      }

      const box = new Box3().setFromObject(assetsGroupRef.current);
      if (Math.abs(box.max[0]) === Infinity) {
        setTimeout(getBoundingBox, 50);
      } else {
        setSceneBoundingBox(box);
      }
    };

    // this is a hack, yet to find a robust way to know when the scene is done loading
    // callbacks in loaders are not reliable
    // check every 50ms for scene's bounding box
    setTimeout(getBoundingBox, 50);
  }, [assetsGroupRef]);

  const [gridSize, numGridLines] = useMemo(() => {
    if (
      !sceneBoundingBox ||
      Math.abs(sceneBoundingBox.max.x) === Infinity ||
      !upVector
    ) {
      return [100, 100];
    }

    const center = sceneBoundingBox.getCenter(new Vector3());
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
      <Lights upVector={upVector} sceneBoundingBox={sceneBoundingBox} />
    </>
  );
};
