import { GizmoHelper, GizmoViewport } from "@react-three/drei";
import { useRecoilValue } from "recoil";
import { VOXEL51_THEME_COLOR } from "../constants";
import { isGridOnAtom } from "../state";
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

export const Fo3dEnvironment = () => {
  const isGridOn = useRecoilValue(isGridOnAtom);

  return (
    <>
      {isGridOn && <gridHelper args={[1000, 1000]} />}
      <GizmoHelper alignment="top-left" margin={[80, 100]}>
        <GizmoViewport />
      </GizmoHelper>
      <OriginHelper />
      <Lights />
    </>
  );
};
