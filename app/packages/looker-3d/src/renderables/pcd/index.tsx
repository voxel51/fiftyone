import { useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import type * as THREE from "three";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader";
import {
  PCD_SHADING_GRADIENTS,
  SHADE_BY_CUSTOM,
  SHADE_BY_HEIGHT,
  SHADE_BY_INTENSITY,
  SHADE_BY_RGB,
} from "../../constants";
import type { ShadeBy } from "../../types";
import { computeMinMaxForColorBufferAttribute } from "../../utils";
import {
  CustomColorShader,
  RgbShader,
  ShadeByHeight,
  ShadeByIntensity,
} from "./shaders";
import { useFoLoader } from "../../hooks/use-fo-loaders";

type PointCloudMeshArgs = {
  upVector: THREE.Vector3;
  defaultShadingColor: string;
  shadeBy: ShadeBy;
  customColor: string;
  pointSize: string;
  isPointSizeAttenuated: boolean;
  src: string;
  rotation: [number, number, number];
  minZ: number | null | undefined;
  onLoad: (boundingBox: THREE.Box3) => void;
};

type ColorMinMax = {
  min: number;
  max: number;
};

export const PointCloudMesh = ({
  defaultShadingColor,
  isPointSizeAttenuated,
  upVector,
  minZ,
  shadeBy,
  customColor,
  pointSize,
  src,
  rotation,
  onLoad,
}: PointCloudMeshArgs) => {
  const points = useFoLoader(PCDLoader, src);

  const [colorMinMax, setColorMinMax] = useState<ColorMinMax>({
    min: 0,
    max: 1,
  });

  const pointsGeometry = points.geometry;

  const boundingBox = useMemo(() => {
    pointsGeometry.computeBoundingBox();
    return pointsGeometry.boundingBox;
  }, [pointsGeometry]);

  useEffect(() => {
    points;
    if (!boundingBox) {
      return;
    }

    onLoad(boundingBox);

    const colorAttribute = pointsGeometry.getAttribute("color");

    if (colorAttribute) {
      setColorMinMax(computeMinMaxForColorBufferAttribute(colorAttribute));
    }
  }, [boundingBox, pointsGeometry, points, onLoad]);

  const maxAlongUpVector = useMemo(() => {
    if (!upVector) {
      return null;
    }

    return boundingBox.max.dot(upVector);
  }, [boundingBox, upVector]);

  const minAlongUpVector = useMemo(() => {
    if (!upVector) {
      return null;
    }

    if (minZ) {
      return minZ;
    }

    return boundingBox.min.dot(upVector);
  }, [boundingBox, upVector, minZ]);

  const pointsMaterial = useMemo(() => {
    const pointSizeNum = Number(pointSize);

    switch (shadeBy) {
      case SHADE_BY_HEIGHT:
        return (
          <ShadeByHeight
            upVector={upVector}
            gradients={PCD_SHADING_GRADIENTS}
            min={minAlongUpVector}
            max={maxAlongUpVector}
            pointSize={pointSizeNum}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_INTENSITY:
        return (
          <ShadeByIntensity
            {...colorMinMax}
            gradients={PCD_SHADING_GRADIENTS}
            pointSize={pointSizeNum}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_RGB:
        return (
          <RgbShader
            pointSize={pointSizeNum}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_CUSTOM:
        return (
          <CustomColorShader
            pointSize={pointSizeNum}
            isPointSizeAttenuated={isPointSizeAttenuated}
            color={customColor}
          />
        );
      default:
        return (
          <pointsMaterial
            color={defaultShadingColor}
            // 1000 and 2 are arbitrary values that seem to work well
            size={
              isPointSizeAttenuated ? pointSizeNum / 1000 : pointSizeNum / 2
            }
            sizeAttenuation={isPointSizeAttenuated}
          />
        );
    }
  }, [
    colorMinMax,
    shadeBy,
    minZ,
    pointSize,
    boundingBox,
    defaultShadingColor,
    isPointSizeAttenuated,
    customColor,
  ]);

  return (
    <primitive
      key={`${pointSize}-${shadeBy}-${isPointSizeAttenuated}-${customColor}`}
      scale={1}
      object={points}
      rotation={rotation}
    >
      {pointsMaterial}
    </primitive>
  );
};
