import { GizmoHelper, GizmoViewport } from "@react-three/drei";
import { useControls } from "leva";
import { useRecoilValue } from "recoil";
import { isGridOnAtom } from "../state";

export const Fo3dEnvironment = () => {
  const isGridOn = useRecoilValue(isGridOnAtom);

  const {
    ambientLightIntensity,
    directionalLightPosition,
    directionalLightIntensity,
  } = useControls("Lights", {
    ambientLightIntensity: {
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Ambient light intensity",
    },
    directionalLightPosition: {
      value: [10, 100, 10],
      label: "Directional light position",
    },
    directionalLightIntensity: {
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Directional light intensity",
    },
  });

  return (
    <>
      {isGridOn && <gridHelper args={[100, 100]} />}
      <GizmoHelper alignment="top-left">
        <GizmoViewport />
      </GizmoHelper>
      <ambientLight intensity={ambientLightIntensity} />
      <directionalLight
        position={directionalLightPosition}
        intensity={directionalLightIntensity}
      />
    </>
  );
};
