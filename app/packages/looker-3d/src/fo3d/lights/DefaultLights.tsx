import { useMemo, useRef } from "react";
import { Vector3 } from "three";
import { FoScene } from "../../hooks";
import {
  getColorKey,
  getIntensityKey,
  getPositionKey,
  useLightControls,
} from "../../hooks/use-light-controls";
import { FoAmbientLightProps, FoDirectionalLightProps } from "../../utils";
import { useFo3dContext } from "../context";

const LIGHT_POSITIONS = [
  "top",
  "bottom",
  "right",
  "left",
  "back",
  "front",
] as const;

export const DefaultLights = () => {
  const { upVector, sceneBoundingBox } = useFo3dContext();

  const editingLightRef = useRef();

  const defaultLightsPositions = useMemo(() => {
    // return four positions for four lights based on the scene bounding box
    if (!sceneBoundingBox) {
      return [];
    }

    const center = sceneBoundingBox.getCenter(new Vector3());
    const size = sceneBoundingBox.getSize(new Vector3());

    const offset = Math.max(Math.max(size.x, size.y, size.z)) + 1;

    if (upVector.y === 1) {
      return [
        new Vector3(0, center.y + offset, 0), // top
        new Vector3(0, center.y - offset, 0), // bottom
        new Vector3(center.x + offset, 0, 0), // right
        new Vector3(center.x - offset, 0, 0), // left
        new Vector3(0, 0, center.z + offset), // back
        new Vector3(0, 0, center.z - offset), // front
      ];
    }

    if (upVector.x === 1) {
      return [
        new Vector3(center.x + offset, 0, 0), // top
        new Vector3(center.x - offset, 0, 0), // bottom
        new Vector3(0, center.y + offset, 0), // right
        new Vector3(0, center.y - offset, 0), // left
        new Vector3(0, 0, center.z + offset), // back
        new Vector3(0, 0, center.z - offset), // front
      ];
    }

    if (upVector.z === 1) {
      return [
        new Vector3(0, 0, center.z + offset), // top
        new Vector3(0, 0, center.z - offset), // bottom
        new Vector3(center.x + offset, 0, 0), // right
        new Vector3(center.x - offset, 0, 0), // left
        new Vector3(0, center.y + offset, 0), // back
        new Vector3(0, center.y - offset, 0), // front
      ];
    }
  }, [upVector, sceneBoundingBox]);

  const defaultLightsProps = useMemo(() => {
    if (defaultLightsPositions?.length === 0) {
      return [];
    }

    const lights: FoScene["lights"] = [
      {
        _type: "AmbientLight",
        name: "Ambient light",
        color: "#ffffff",
        intensity: 0.1,
      } as FoAmbientLightProps,
    ];

    for (let i = 0; i < defaultLightsPositions.length; i++) {
      const position = defaultLightsPositions[i];

      lights.push({
        _type: "DirectionalLight",
        name: `Directional light-${LIGHT_POSITIONS[i]}`,
        color: "#ffffff",
        intensity: 1,
        position: [position.x, position.y, position.z],
      } as FoDirectionalLightProps);
    }

    return lights;
  }, [defaultLightsPositions]);

  const [lightConfig, lightHelperConfig] = useLightControls(
    defaultLightsProps,
    editingLightRef
  );

  const lightElements = useMemo(() => {
    if (!lightConfig || !defaultLightsProps) {
      return null;
    }

    return defaultLightsProps.map((light, index) => {
      const intensityKey = getIntensityKey(light.name);
      const colorKey = getColorKey(light.name);
      const positionKey = getPositionKey(light.name);

      const intensity = lightConfig[intensityKey];
      const color = lightConfig[colorKey];
      const position = lightConfig[positionKey];

      const refProps =
        lightHelperConfig?.lightIndex === index ? { ref: editingLightRef } : {};

      switch (light._type) {
        case "AmbientLight":
          return (
            <ambientLight
              key={light.name}
              color={color}
              intensity={intensity}
            />
          );
        case "DirectionalLight":
          return (
            <directionalLight
              key={light.name}
              position={position}
              intensity={intensity}
              color={color}
              {...refProps}
            />
          );
        default:
          return null;
      }
    });
  }, [lightConfig, lightHelperConfig, defaultLightsProps]);

  return lightElements;
};
