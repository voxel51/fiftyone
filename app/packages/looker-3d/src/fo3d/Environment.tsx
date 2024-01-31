import { GizmoHelper, GizmoViewport } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { Box3, Group, Vector3 } from "three";
import { VOXEL51_THEME_COLOR } from "../constants";
import { isGridOnAtom } from "../state";
import { getGridQuaternionFromUpVector } from "../utils";
import { Lights } from "./Lights";

const OriginHelper = () => {
  return (
    <group>
      <axesHelper />
      <mesh>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshBasicMaterial
          color={VOXEL51_THEME_COLOR}
          opacity={0.4}
          transparent
        />
      </mesh>
    </group>
  );
};

export const Fo3dEnvironment = ({
  assetsGroupRef,
  allAssetsLoaded,
  sceneBoundingBox,
  setSceneBoundingBox,
  upVector,
}: {
  allAssetsLoaded: boolean;
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

  useFrame(() => {
    if (!sceneBoundingBox && allAssetsLoaded && assetsGroupRef.current) {
      const box = new Box3().setFromObject(assetsGroupRef.current);
      setSceneBoundingBox(box);
    }
  });

  return (
    <>
      {isGridOn && (
        <gridHelper args={[1000, 1000]} quaternion={gridHelperQuarternion} />
      )}
      <GizmoHelper alignment="top-left" margin={[80, 100]}>
        <GizmoViewport />
      </GizmoHelper>
      <OriginHelper />
      <Lights />
    </>
  );
};
