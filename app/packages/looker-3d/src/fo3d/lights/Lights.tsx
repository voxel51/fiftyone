import { partition } from "lodash";
import { useMemo, useRef } from "react";
import { Object3D } from "three";
import { FoScene } from "../../hooks";
import {
  getColorKey,
  getDecayKey,
  getIntensityKey,
  getPositionKey,
  useLightControls,
} from "../../hooks/use-light-controls";
import { DefaultLights } from "./DefaultLights";

export interface FoLightProps {
  lights: FoScene["lights"];
}

const CustomLights = ({ lights }: Pick<FoLightProps, "lights">) => {
  const filteredLights = useMemo(() => {
    const [ambientLights, otherLights] = partition(lights, (light) => {
      return light._type === "AmbientLight";
    });

    if (ambientLights.length > 1) {
      console.warn("Only one ambient light is allowed");
      return [ambientLights[0], ...otherLights];
    }

    return lights;
  }, [lights]);

  const editingLightRef = useRef();

  const [lightConfig, lightHelperConfig] = useLightControls(
    filteredLights,
    editingLightRef
  );

  const target = useMemo(() => {
    for (const light of filteredLights) {
      if (
        (light._type === "DirectionalLight" || light._type === "SpotLight") &&
        light.target
      ) {
        const targetObject = new Object3D();
        targetObject.position.set(...light.target);
        return targetObject;
      }
    }
    return null;
  }, [filteredLights]);

  const lightElements = useMemo(() => {
    if (!filteredLights || !lightConfig) {
      return null;
    }

    return filteredLights.map((light, index) => {
      const intensityKey = getIntensityKey(light.name);
      const colorKey = getColorKey(light.name);
      const positionKey = getPositionKey(light.name);
      const decayKey = getDecayKey(light.name);

      const intensity = lightConfig[intensityKey];
      const color = lightConfig[colorKey];
      const position = lightConfig[positionKey];
      const decay = lightConfig[decayKey];

      const refProps =
        lightHelperConfig?.lightIndex === index ? { ref: editingLightRef } : {};

      switch (light._type) {
        case "AmbientLight":
          return (
            <ambientLight
              key={light.name}
              color={color}
              intensity={intensity}
              {...refProps}
            />
          );
        case "DirectionalLight":
          return (
            <directionalLight
              key={light.name}
              color={color}
              intensity={intensity}
              position={position}
              quaternion={light.quaternion}
              target={target}
              {...refProps}
            />
          );
        case "SpotLight":
          return (
            <spotLight
              key={light.name}
              color={color}
              intensity={intensity}
              position={position}
              quaternion={light.quaternion}
              angle={light.angle}
              penumbra={light.penumbra}
              decay={decay}
              distance={light.distance}
              target={target}
              {...refProps}
            />
          );
        case "PointLight":
          return (
            <pointLight
              key={light.name}
              color={color}
              intensity={intensity}
              position={position}
              decay={decay}
              distance={light.distance}
              {...refProps}
            />
          );
        default:
          return null;
      }
    });
  }, [filteredLights, lightConfig, target, lightHelperConfig]);

  return <group>{lightElements}</group>;
};

export const Lights = ({ lights: customLights }: FoLightProps) => {
  if (!customLights) {
    return <DefaultLights />;
  }

  return <CustomLights lights={customLights} />;
};
