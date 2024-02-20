import { folder, useControls } from "leva";
import { partition } from "lodash";
import { useMemo } from "react";
import { Box3, Vector3 } from "three";
import { PANEL_ORDER_LIGHTS } from "../../constants";
import { FoScene } from "../../hooks";
import { DefaultLights } from "./DefaultLights";

export interface FoLightProps {
  upVector: Vector3;
  sceneBoundingBox: Box3;
  lights: FoScene["lights"];
}

const getIntensityKey = (lightName: string) => `${lightName}Intensity`;

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

  const lightIntensityConfig = useMemo(() => {
    const config = {};

    for (const light of filteredLights) {
      const intensityKey = getIntensityKey(light.name);
      config[intensityKey] = {
        value: light.intensity,
        min: 0,
        max: 1,
        step: 0.01,
        label: `${light.name} intensity`,
      };
    }

    return config;
  }, [filteredLights]);

  const intensities = useControls(() => ({
    Lights: folder(lightIntensityConfig, {
      order: PANEL_ORDER_LIGHTS,
      collapsed: true,
    }),
  }));

  return filteredLights.map((light) => {
    const intensityKey = getIntensityKey(light.name);
    switch (light._type) {
      case "AmbientLight":
        return <ambientLight intensity={intensities[intensityKey]} />;
    }
  });
};

export const Lights = ({
  upVector,
  sceneBoundingBox,
  lights: customLights,
}: FoLightProps) => {
  if (!customLights) {
    return (
      <DefaultLights upVector={upVector} sceneBoundingBox={sceneBoundingBox} />
    );
  }

  return <CustomLights lights={customLights} />;
};
