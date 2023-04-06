import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { computeMinMaxForColorBufferAttribute } from "../../../utils";
import { ShadeBy } from "../../state";
import {
  Gradients,
  RgbShader,
  ShadeByHeight,
  ShadeByIntensity,
} from "./shaders";

type PointCloudMeshArgs = {
  defaultShadingColor: string;
  shadeBy: ShadeBy;
  pointSize: string;
  isPointSizeAttenuated: boolean;
  points: THREE.Points;
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
  pointSize,
  points,
  rotation,
  onLoad,
}: PointCloudMeshArgs) => {
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

    if (shadeBy === "height") {
      return (
        <ShadeByHeight
          gradients={ShadingGradients}
          min={minZ}
          max={boundingBox.max.z}
          pointSize={pointSizeNum}
          isPointSizeAttenuated={isPointSizeAttenuated}
        />
      );
    }

    if (shadeBy === "intensity") {
      return (
        <ShadeByIntensity
          {...colorMinMax}
          gradients={ShadingGradients}
          pointSize={pointSizeNum}
          isPointSizeAttenuated={isPointSizeAttenuated}
        />
      );
    }

    if (shadeBy === "rgb") {
      return (
        <RgbShader
          pointSize={pointSizeNum}
          isPointSizeAttenuated={isPointSizeAttenuated}
        />
      );
    }

    return (
      <pointsMaterial
        color={defaultShadingColor}
        // 1000 and 2 are arbitrary values that seem to work well
        size={isPointSizeAttenuated ? pointSizeNum / 1000 : pointSizeNum / 2}
        sizeAttenuation={isPointSizeAttenuated}
      />
    );
  }, [
    colorMinMax,
    shadeBy,
    minZ,
    pointSize,
    boundingBox,
    defaultShadingColor,
    isPointSizeAttenuated,
  ]);

  return (
    <primitive
      key={`${pointSize}-${shadeBy}-${isPointSizeAttenuated}`}
      scale={1}
      object={points}
      rotation={rotation}
    >
      {pointsMaterial}
    </primitive>
  );
};
