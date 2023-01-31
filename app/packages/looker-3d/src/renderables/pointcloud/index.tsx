import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { computeMinMaxForColorBufferAttribute } from "../../../utils";
import { ColorBy } from "../../state";
import {
  Gradients,
  RgbShader,
  ShadeByHeight,
  ShadeByIntensity,
} from "./shaders";

type PointCloudMeshArgs = {
  colorBy: ColorBy;
  pointSize: number;
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
  minZ,
  colorBy,
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

  if (minZ === undefined) {
    minZ = boundingBox.min.z;
  }

  const pointsMaterial = useMemo(() => {
    const customShaderNormalizedPointSize = pointSize * 100;

    if (colorBy === "height") {
      return (
        <ShadeByHeight
          gradients={ShadingGradients}
          min={minZ}
          max={boundingBox.max.z}
          pointSize={customShaderNormalizedPointSize}
        />
      );
    }

    if (colorBy === "intensity") {
      return (
        <ShadeByIntensity
          {...colorMinMax}
          gradients={ShadingGradients}
          pointSize={customShaderNormalizedPointSize}
        />
      );
    }

    if (pointsGeometry.getAttribute("color")) {
      return <RgbShader pointSize={customShaderNormalizedPointSize} />;
    }

    return <pointsMaterial color={"white"} size={pointSize} />;
  }, [colorMinMax, colorBy, minZ, pointSize, boundingBox, pointsGeometry]);

  return (
    <primitive
      key={`${pointSize}-${colorBy}`}
      scale={1}
      object={points}
      rotation={rotation}
    >
      {pointsMaterial}
    </primitive>
  );
};
