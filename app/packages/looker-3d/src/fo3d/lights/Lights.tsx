import { useHelper } from "@react-three/drei";
import { folder, useControls } from "leva";
import { partition } from "lodash";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  DirectionalLightHelper,
  Object3D,
  PointLightHelper,
  SpotLightHelper,
} from "three";
import { PANEL_ORDER_LIGHTS, VOXEL51_THEME_COLOR } from "../../constants";
import { FoScene } from "../../hooks";
import { DefaultLights } from "./DefaultLights";

export interface FoLightProps {
  lights: FoScene["lights"];
}

type LightHelperConfig = {
  type: Omit<FoScene["lights"][number]["_type"], "AmbientLight">;
  lightIndex: number;
};

const getIntensityKey = (lightName: string) => `${lightName}Intensity`;
const getColorKey = (lightName: string) => `${lightName}Color`;
const getPositionKey = (lightName: string) => `${lightName}Position`;

const CustomLights = ({ lights }: Pick<FoLightProps, "lights">) => {
  const [lightHelperConfig, setLightHelperConfig] =
    useState<LightHelperConfig | null>(null);

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

  const onLightDragStart = useCallback((type: string, lightIndex: number) => {
    setLightHelperConfig({
      type,
      lightIndex,
    });
  }, []);

  const onLightDragEnd = useCallback(() => {
    setLightHelperConfig(null);
  }, []);

  const lightLevaControls = useMemo(() => {
    const config = {};

    for (let i = 0; i < filteredLights.length; i++) {
      const light = filteredLights[i];
      const intensityKey = getIntensityKey(light.name);
      const colorKey = getColorKey(light.name);
      const positionKey = getPositionKey(light.name);

      config[intensityKey] = {
        value: light.intensity,
        min: 0,
        max: 1,
        step: 0.01,
        label: `${light.name} intensity`,
      };

      config[colorKey] = {
        value: light.color,
        label: `${light.name} color`,
      };

      if (light._type !== "AmbientLight") {
        config[positionKey] = {
          value: light.position,
          label: `${light.name} position`,
          onEditStart: () => {
            onLightDragStart(light._type, i);
          },
          onEditEnd: onLightDragEnd,
        };
      }
    }

    return config;
  }, [filteredLights, onLightDragEnd, onLightDragStart]);

  const [lightConfig] = useControls(
    () => ({
      Lights: folder(lightLevaControls, {
        order: PANEL_ORDER_LIGHTS,
        collapsed: true,
      }),
    }),
    [lightLevaControls]
  );

  const lightRef = useRef();

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

      const intensity = lightConfig[intensityKey];
      const color = lightConfig[colorKey];
      const position = lightConfig[positionKey];

      const refProps =
        lightHelperConfig?.lightIndex === index ? { ref: lightRef } : {};

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
              decay={light.decay}
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
              distance={light.distance}
              decay={light.decay}
              {...refProps}
            />
          );
        default:
          return null;
      }
    });
  }, [filteredLights, lightConfig, target, lightHelperConfig]);

  const helperClass = useMemo(() => {
    if (!lightHelperConfig) {
      return null;
    }

    const { type } = lightHelperConfig;

    switch (type) {
      case "DirectionalLight":
        return DirectionalLightHelper;
      case "SpotLight":
        return SpotLightHelper;
      case "PointLight":
        return PointLightHelper;
      default:
        return null;
    }
  }, [lightHelperConfig]);

  useHelper(
    lightHelperConfig ? lightRef : false,
    helperClass,
    0.1,
    VOXEL51_THEME_COLOR
  );

  return <group>{lightElements}</group>;
};

export const Lights = ({ lights: customLights }: FoLightProps) => {
  if (!customLights) {
    return <DefaultLights />;
  }

  return <CustomLights lights={customLights} />;
};
