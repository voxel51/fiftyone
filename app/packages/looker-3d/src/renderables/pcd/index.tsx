import { useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader";
import {
  SHADE_BY_CUSTOM,
  SHADE_BY_HEIGHT,
  SHADE_BY_INTENSITY,
  SHADE_BY_RGB,
} from "../../constants";
import { ShadeBy } from "../../types";
import { computeMinMaxForColorBufferAttribute } from "../../utils";
import {
  CustomColorShader,
  Gradients,
  RgbShader,
  ShadeByHeight,
  ShadeByIntensity,
} from "./shaders";

type PointCloudMeshArgs = {
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

const ShadingGradients: Gradients = [
  [0.0, "rgb(165,0,38)"],
  [0.111, "rgb(215,48,39)"],
  [0.222, "rgb(244,109,67)"],
  [0.333, "rgb(253,174,97)"],
  [0.444, "rgb(254,224,144)"],
  [0.555, "rgb(224,243,248)"],
  [0.666, "rgb(171,217,233)"],
  [0.777, "rgb(116,173,209)"],
  [0.888, "rgb(69,117,180)"],
  [1.0, "rgb(49,54,149)"],
];

export const PointCloudMesh = ({
  defaultShadingColor,
  isPointSizeAttenuated,
  minZ,
  shadeBy,
  customColor,
  pointSize,
  src,
  rotation,
  onLoad,
}: PointCloudMeshArgs) => {
  const points = useLoader(PCDLoader, src);

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
    if (!boundingBox) {
      return;
    }

    onLoad(boundingBox);

    const colorAttribute = pointsGeometry.getAttribute("color");

    if (colorAttribute) {
      setColorMinMax(computeMinMaxForColorBufferAttribute(colorAttribute));
    }
  }, [boundingBox, pointsGeometry, points, onLoad]);

  if (minZ === null || minZ === undefined) {
    minZ = boundingBox.min.z;
  }

  const pointsMaterial = useMemo(() => {
    const pointSizeNum = Number(pointSize);

    switch (shadeBy) {
      case SHADE_BY_HEIGHT:
        return (
          <ShadeByHeight
            gradients={ShadingGradients}
            min={minZ}
            max={boundingBox.max.z}
            pointSize={pointSizeNum}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_INTENSITY:
        return (
          <ShadeByIntensity
            {...colorMinMax}
            gradients={ShadingGradients}
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
