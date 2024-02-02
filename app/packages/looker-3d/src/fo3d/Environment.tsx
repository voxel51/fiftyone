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
      console.log("box max is ", box.max[0]);
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

  return (
    <>
      {isGridOn && (
        <gridHelper args={[1000, 1000]} quaternion={gridHelperQuarternion} />
      )}
      <GizmoHelper alignment="top-left" margin={[80, 100]}>
        <GizmoViewport />
      </GizmoHelper>
      <OriginHelper />
      <Lights upVector={upVector} sceneBoundingBox={sceneBoundingBox} />
    </>
  );
};
