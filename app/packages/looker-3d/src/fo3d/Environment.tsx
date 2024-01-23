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
      value: [100, 1000, 100],
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
      {isGridOn && <gridHelper args={[1000, 1000]} />}
      <GizmoHelper alignment="top-left">
        <GizmoViewport />
      </GizmoHelper>
      <ambientLight intensity={ambientLightIntensity} />
      <directionalLight
        position={directionalLightPosition}
        intensity={directionalLightIntensity}
      />
      <pointLight position={[1000, 1000, 100]} />
      <pointLight position={[-100, -100, -100]} />
      <pointLight position={[100, 100, -100]} />
      <pointLight position={[-100, 100, 100]} />
      <pointLight position={[100, -100, 100]} />
      <pointLight position={[100, -100, -100]} />
      <pointLight position={[-100, 100, -100]} />
      <pointLight position={[-100, -100, 100]} />
    </>
  );
};
