import { folder, useControls } from "leva";
import { useMemo } from "react";
import { Box3, Vector3 } from "three";
import { PANEL_ORDER_LIGHTS } from "../constants";

export const Lights = ({
  upVector,
  sceneBoundingBox,
}: {
  upVector: Vector3;
  sceneBoundingBox: Box3;
}) => {
  const directionalLightPositions = useMemo(() => {
    // return four positions for four lights based on the scene bounding box
    if (!sceneBoundingBox) {
      return [];
    }

    const center = sceneBoundingBox.getCenter(new Vector3());
    const size = sceneBoundingBox.getSize(new Vector3());

    const offset = Math.max(Math.max(size.x, size.y, size.z) * 2, 100);

    if (upVector.y === 1) {
      return [
        new Vector3(0, center.y + offset, 0), // top
        new Vector3(0, center.y - offset, 0), // bottom
        new Vector3(center.x + offset, 0, 0), // right
        new Vector3(center.x - offset, 0, 0), // left
      ];
    }

    if (upVector.x === 1) {
      return [
        new Vector3(center.x + offset, 0, 0), // top
        new Vector3(center.x - offset, 0, 0), // bottom
        new Vector3(0, center.y + offset, 0), // right
        new Vector3(0, center.y - offset, 0), // left
      ];
    }

    if (upVector.z === 1) {
      return [
        new Vector3(0, 0, center.z + offset), // top
        new Vector3(0, 0, center.z - offset), // bottom
        new Vector3(center.x + offset, 0, 0), // right
        new Vector3(center.x - offset, 0, 0), // left
      ];
    }
  }, [upVector, sceneBoundingBox]);

  const [{ ambientLightIntensity, directionalLightIntensity }] = useControls(
    () => ({
      Lights: folder(
        {
          ambientLightIntensity: {
            value: 0.1,
            min: 0,
            max: 1,
            step: 0.01,
            label: "Ambient light intensity",
          },
          directionalLightIntensity: {
            value: 0.5,
            min: 0,
            max: 1,
            step: 0.01,
            label: "Directional light intensity",
          },
        },
        {
          order: PANEL_ORDER_LIGHTS,
          collapsed: true,
        }
      ),
    })
  );

  const directionalLightScaled = useMemo(() => {
    return directionalLightIntensity * Math.PI;
  }, [directionalLightIntensity]);

  return (
    <>
      <ambientLight intensity={ambientLightIntensity} />
      {directionalLightPositions.map((position) => {
        return (
          <directionalLight
            key={`directional-light-${position.x}-${position.y}-${position.z}`}
            position={position}
            intensity={directionalLightScaled}
          />
        );
      })}
    </>
  );
};
