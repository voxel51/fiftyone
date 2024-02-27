import { useLoader } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import { Quaternion, Vector3 } from "three";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader";
import {
  PCD_SHADING_GRADIENTS,
  SHADE_BY_CUSTOM,
  SHADE_BY_HEIGHT,
  SHADE_BY_INTENSITY,
  SHADE_BY_RGB,
} from "../constants";
import { PcdAsset } from "../hooks";
import { useFo3dBounds } from "../hooks/use-bounds";
import { usePcdControls } from "../hooks/use-pcd-controls";
import {
  CustomColorShader,
  RgbShader,
  ShadeByHeight,
  ShadeByIntensity,
} from "../renderables/pcd/shaders";
import { computeMinMaxForColorBufferAttribute } from "../utils";
import { useFo3dContext } from "./context";

export const Pcd = ({
  name,
  pcd,
  position,
  quaternion,
  scale,
}: {
  name: string;
  pcd: PcdAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}) => {
  const points = useLoader(PCDLoader, pcd.pcdUrl);
  const pcdContainerRef = useRef();

  const { customColor, pointSize, isPointSizeAttenuated, shadeBy } =
    usePcdControls(name, pcd.defaultMaterial);

  const { upVector, pluginSettings } = useFo3dContext();

  const pcdBoundingBox = useFo3dBounds(
    pcdContainerRef,
    useCallback(() => {
      return !!points && shadeBy === SHADE_BY_HEIGHT;
    }, [points, shadeBy])
  );

  const minMaxCoordinates = useMemo(() => {
    if (shadeBy !== SHADE_BY_HEIGHT || !pcdBoundingBox || !upVector) {
      return null;
    }

    // note: we should deprecate minZ in the plugin settings, since it doesn't account for non-z up vectors
    if (pluginSettings?.pointCloud?.minZ) {
      return [pluginSettings.pointCloud.minZ, pcdBoundingBox.max.z];
    }

    const min = pcdBoundingBox.min.dot(upVector);
    const max = pcdBoundingBox.max.dot(upVector);

    return [min, max];
  }, [upVector, pcdBoundingBox, shadeBy, pluginSettings]);

  const { min: minIntensity, max: maxIntensity } = useMemo(() => {
    if (shadeBy !== SHADE_BY_INTENSITY || !points) {
      return { min: 0, max: 1 };
    }

    const intensity =
      points.geometry.getAttribute("color") ??
      points.geometry.getAttribute("intensity");

    if (intensity) {
      return computeMinMaxForColorBufferAttribute(intensity);
    }

    return { min: 0, max: 1 };
  }, [points, shadeBy]);

  const pointsMaterial = useMemo(() => {
    // to trigger rerender
    const key = `${name}-${pointSize}-${isPointSizeAttenuated}-${shadeBy}-${customColor}-${minMaxCoordinates}-${minIntensity}-${maxIntensity}-${upVector}`;

    switch (shadeBy) {
      case SHADE_BY_HEIGHT:
        /**
         * FIX ME: while `pointsMaterial` respects `upVector` in shade-by-height, it disregards rotation / translation / scale
         * applied to the pcd. This is because the shader is applied to the points, not the pcd container.
         *
         * The behavior is undefined if the pcd is rotated / translated / scaled.
         */
        return (
          <ShadeByHeight
            gradients={PCD_SHADING_GRADIENTS}
            min={minMaxCoordinates?.at(0) ?? 0}
            max={minMaxCoordinates?.at(1) ?? 100}
            upVector={upVector}
            key={key}
            pointSize={pointSize}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_INTENSITY:
        return (
          <ShadeByIntensity
            key={key}
            min={minIntensity}
            max={maxIntensity}
            gradients={PCD_SHADING_GRADIENTS}
            pointSize={pointSize}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_RGB:
        return (
          <RgbShader
            pointSize={pointSize}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_CUSTOM:
        return (
          <CustomColorShader
            key={key}
            pointSize={pointSize}
            isPointSizeAttenuated={isPointSizeAttenuated}
            color={customColor || "#ffffff"}
          />
        );
      default:
        return (
          <pointsMaterial
            color={"white"}
            // color={defaultShadingColor}
            // 1000 and 2 are arbitrary values that seem to work well
            size={isPointSizeAttenuated ? pointSize / 1000 : pointSize / 2}
            sizeAttenuation={isPointSizeAttenuated}
          />
        );
    }
  }, [
    shadeBy,
    pointSize,
    isPointSizeAttenuated,
    customColor,
    minMaxCoordinates,
    minIntensity,
    maxIntensity,
    upVector,
  ]);

  if (!points) {
    return null;
  }

  return (
    <primitive
      ref={pcdContainerRef}
      object={points}
      position={position}
      quaternion={quaternion}
      scale={scale}
    >
      {pointsMaterial}
    </primitive>
  );
};
