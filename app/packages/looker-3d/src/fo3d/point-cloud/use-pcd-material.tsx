import { useCallback, useMemo } from "react";
import type { BufferGeometry } from "three";
import {
  SHADE_BY_CUSTOM,
  SHADE_BY_HEIGHT,
  SHADE_BY_INTENSITY,
  SHADE_BY_NONE,
  SHADE_BY_RGB,
} from "../../constants";
import type { PcdAsset } from "../../hooks";
import { useFo3dBounds } from "../../hooks/use-bounds";
import { usePcdMaterialControls } from "../../hooks/use-pcd-material-controls";
import {
  CustomColorShader,
  DynamicAttributeShader,
  RgbShader,
  ShadeByHeight,
  ShadeByIntensity,
} from "../../renderables/pcd/shaders";
import {
  computeMinMaxForColorBufferAttribute,
  computeMinMaxForScalarBufferAttribute,
} from "../../utils";
import { useFo3dContext } from "../context";

export const getMinMaxForAttribute = (
  geometry: BufferGeometry,
  attributeName: string
) => {
  if (!geometry.hasAttribute(attributeName)) {
    return [0, 1];
  }

  const attr = geometry.getAttribute(attributeName);
  let min = 0,
    max = 1;
  if (attr && attr.itemSize === 1) {
    // prefer userData if available (which it should be, since we set it during parsing)
    if (
      geometry.userData &&
      geometry.userData[attributeName] &&
      typeof geometry.userData[attributeName].min === "number" &&
      typeof geometry.userData[attributeName].max === "number"
    ) {
      min = geometry.userData[attributeName].min;
      max = geometry.userData[attributeName].max;
    } else {
      const minMax = computeMinMaxForScalarBufferAttribute(attr);
      min = minMax.min;
      max = minMax.max;
    }
  }

  return [min, max] as const;
};

export const usePcdMaterial = (
  name: string,
  geometry: BufferGeometry,
  defaultMaterial: PcdAsset["defaultMaterial"],
  pcdContainerRef: React.RefObject<any>
) => {
  const { upVector, pluginSettings } = useFo3dContext();

  const pcdBoundingBox = useFo3dBounds(
    pcdContainerRef,
    useCallback(() => {
      return !!geometry;
    }, [geometry])
  );

  const minMaxCoordinates = useMemo(() => {
    if (!pcdBoundingBox) {
      return null;
    }

    // note: we should deprecate minZ in the plugin settings, since it doesn't account for non-z up vectors
    if (pluginSettings?.pointCloud?.minZ) {
      return [pluginSettings.pointCloud.minZ, pcdBoundingBox.max.z];
    }

    const min = pcdBoundingBox.min.dot(upVector);
    const max = pcdBoundingBox.max.dot(upVector);

    return [min, max] as const;
  }, [upVector, pcdBoundingBox, pluginSettings]);

  const {
    activeThreshold,
    customColor,
    pointSize,
    isPointSizeAttenuated,
    shadeBy,
    opacity,
    colorMap,
    isColormapModalOpen,
    setIsColormapModalOpen,
    handleColormapSave,
  } = usePcdMaterialControls(name, geometry, defaultMaterial);

  // "intensity" itself is generalizable as a custom attribute, but because we
  // defined "intensity" as a special attribute (namely, r of rgb),
  // we need custom handling
  const { minIntensity, maxIntensity } = useMemo(() => {
    if (shadeBy !== SHADE_BY_INTENSITY) {
      return { minIntensity: 0, maxIntensity: 1 };
    }

    const isLegacyIntensity = !geometry.hasAttribute("intensity");

    if (isLegacyIntensity) {
      const attrib = geometry.hasAttribute("rgb") ? "rgb" : null;

      if (!attrib) {
        return { minIntensity: 0, maxIntensity: 1 };
      }

      const minMax = computeMinMaxForColorBufferAttribute(
        geometry.getAttribute(attrib)
      );

      return {
        minIntensity: minMax.min,
        maxIntensity: minMax.max,
      };
    }

    const minMax = computeMinMaxForScalarBufferAttribute(
      geometry.getAttribute("intensity")
    );

    return {
      minIntensity: minMax.min,
      maxIntensity: minMax.max,
    };
  }, [geometry, shadeBy]);

  const pointsMaterial = useMemo(() => {
    // to trigger rerender
    const key = `${name}-${opacity}-${pointSize}-${isPointSizeAttenuated}-${shadeBy}-${customColor}-${minMaxCoordinates}-${minIntensity}-${maxIntensity}-${upVector}-${
      colorMap ? JSON.stringify(colorMap) : ""
    }-${activeThreshold ? JSON.stringify(activeThreshold) : ""}`;

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
            colorMap={colorMap}
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
            minIntensity={minIntensity}
            maxIntensity={maxIntensity}
            colorMap={colorMap}
            pointSize={pointSize}
            opacity={opacity}
            isPointSizeAttenuated={isPointSizeAttenuated}
            isLegacyIntensity={!geometry.hasAttribute("intensity")}
            thresholdMin={activeThreshold?.[0]}
            thresholdMax={activeThreshold?.[1]}
          />
        );

      case SHADE_BY_RGB:
        return (
          <RgbShader
            key={key}
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

      case SHADE_BY_NONE:
        return (
          <pointsMaterial
            color={"#ffffff"}
            size={isPointSizeAttenuated ? pointSize / 1000 : pointSize / 2}
            opacity={opacity}
            sizeAttenuation={isPointSizeAttenuated}
          />
        );

      default: {
        if (geometry.hasAttribute(shadeBy)) {
          const [min, max] = getMinMaxForAttribute(geometry, shadeBy);

          return (
            <DynamicAttributeShader
              key={key}
              attribute={shadeBy}
              min={min}
              max={max}
              pointSize={pointSize}
              isPointSizeAttenuated={isPointSizeAttenuated}
              opacity={opacity}
              geometry={geometry}
              colorMap={colorMap}
              thresholdMin={activeThreshold?.[0]}
              thresholdMax={activeThreshold?.[1]}
            />
          );
        } else {
          // fallback to default
          return (
            <pointsMaterial
              color={"#ffffff"}
              size={isPointSizeAttenuated ? pointSize / 1000 : pointSize / 2}
              opacity={opacity}
              sizeAttenuation={isPointSizeAttenuated}
            />
          );
        }
      }
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
    colorMap,
    activeThreshold,
  ]);

  return {
    pointsMaterial,
    shadingMode: shadeBy,
    colorMap,
    isColormapModalOpen,
    setIsColormapModalOpen,
    handleColormapSave,
  };
};
