import { useCallback, useMemo } from "react";
import { BufferGeometry } from "three";
import {
  PCD_SHADING_GRADIENTS,
  SHADE_BY_CUSTOM,
  SHADE_BY_HEIGHT,
  SHADE_BY_INTENSITY,
  SHADE_BY_RGB,
} from "../../constants";
import { PcdAsset } from "../../hooks";
import { useFo3dBounds } from "../../hooks/use-bounds";
import { usePcdMaterialControls } from "../../hooks/use-pcd-material-controls";
import {
  CustomColorShader,
  RgbShader,
  ShadeByHeight,
  ShadeByIntensity,
} from "../../renderables/pcd/shaders";
import { computeMinMaxForColorBufferAttribute } from "../../utils";
import { useFo3dContext } from "../context";

export const usePcdMaterial = (
  name: string,
  geometry: BufferGeometry,
  defaultMaterial: PcdAsset["defaultMaterial"],
  pcdContainerRef: React.RefObject<any>
) => {
  const { upVector, pluginSettings } = useFo3dContext();

  const { customColor, pointSize, isPointSizeAttenuated, shadeBy, opacity } =
    usePcdMaterialControls(name, defaultMaterial);

  const pcdBoundingBox = useFo3dBounds(
    pcdContainerRef,
    useCallback(() => {
      return !!geometry && shadeBy === SHADE_BY_HEIGHT;
    }, [geometry, shadeBy])
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
    if (shadeBy !== SHADE_BY_INTENSITY || !geometry) {
      return { min: 0, max: 1 };
    }

    const intensity =
      geometry.getAttribute("color") ?? geometry.getAttribute("intensity");

    if (intensity) {
      return computeMinMaxForColorBufferAttribute(intensity);
    }

    return { min: 0, max: 1 };
  }, [geometry, shadeBy]);

  const pointsMaterial = useMemo(() => {
    // to trigger rerender
    const key = `${name}-${opacity}-${pointSize}-${isPointSizeAttenuated}-${shadeBy}-${customColor}-${minMaxCoordinates}-${minIntensity}-${maxIntensity}-${upVector}`;

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
            opacity={opacity}
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
            opacity={opacity}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_RGB:
        return (
          <RgbShader
            pointSize={pointSize}
            opacity={opacity}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_CUSTOM:
        return (
          <CustomColorShader
            key={key}
            pointSize={pointSize}
            opacity={opacity}
            isPointSizeAttenuated={isPointSizeAttenuated}
            color={customColor || "#ffffff"}
          />
        );
      default:
        return (
          <pointsMaterial
            color={"#ffffff"}
            // 1000 and 2 are arbitrary values that seem to work well
            size={isPointSizeAttenuated ? pointSize / 1000 : pointSize / 2}
            opacity={opacity}
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
    geometry,
    upVector,
    opacity,
    name,
  ]);

  return pointsMaterial;
};
