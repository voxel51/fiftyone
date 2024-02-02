import { useControls } from "leva";

export const Lights = () => {
  const {
    ambientLightIntensity,
    directionalLightPosition,
    directionalLightIntensity,
  } = useControls(
    "Lights",
    {
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
    },
    { collapsed: true }
  );

  return (
    <>
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
