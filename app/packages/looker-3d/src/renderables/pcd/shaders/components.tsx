import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  DynamicAttributeShaders,
  ShadeByCustomColorShaders,
  ShadeByHeightShaders,
  ShadeByIntensityShaders,
  ShadeByLegacyIntensityShaders,
  ShadeByRgbShaders,
} from "./glsl";
import useGradientMap from "./gradientMap";
import type { ShaderProps } from "./types";

export const DynamicAttributeShader = ({
  attribute,
  min,
  max,
  pointSize,
  isPointSizeAttenuated,
  opacity,
  geometry,
  colorMap,
}: ShaderProps & {
  attribute: string;
  geometry: THREE.BufferGeometry;
}) => {
  const gradientMap = useGradientMap(colorMap);

  /**
   * this is how we pass the attribute value to the shader
   * in a way that works for every attribute
   */
  useEffect(() => {
    if (geometry && geometry.hasAttribute(attribute)) {
      geometry.setAttribute("dynamicAttr", geometry.getAttribute(attribute));
    }
  }, [geometry, attribute]);

  return (
    <shaderMaterial
      glslVersion={THREE.GLSL3}
      attach="material"
      uniforms={{
        uMin: { value: min },
        uMax: { value: max },
        opacity: { value: opacity ?? 1 },
        gradientMap: { value: gradientMap },
        pointSize: { value: pointSize },
        isPointSizeAttenuated: { value: isPointSizeAttenuated },
      }}
      vertexShader={DynamicAttributeShaders.vertexShader}
      fragmentShader={DynamicAttributeShaders.fragmentShader}
    />
  );
};

export const ShadeByHeight = ({
  colorMap,
  min,
  max,
  upVector,
  pointSize,
  opacity,
  isPointSizeAttenuated,
}: ShaderProps) => {
  const gradientMap = useGradientMap(colorMap);
  const upVectorVec3 = useMemo(() => {
    return [upVector.x, upVector.y, upVector.z];
  }, [upVector]);

  return (
    <shaderMaterial
      glslVersion={THREE.GLSL3}
      {...{
        uniforms: {
          opacity: { value: opacity ?? 1 },
          min: { value: min },
          max: { value: max },
          upVector: { value: upVectorVec3 },
          gradientMap: { value: gradientMap },
          pointSize: { value: pointSize },
          isPointSizeAttenuated: { value: isPointSizeAttenuated },
        },
        vertexShader: ShadeByHeightShaders.vertexShader,
        fragmentShader: ShadeByHeightShaders.fragmentShader,
      }}
    />
  );
};

export const ShadeByIntensity = ({
  colorMap,
  minIntensity,
  maxIntensity,
  opacity,
  pointSize,
  isPointSizeAttenuated,
  isLegacyIntensity,
}: Omit<ShaderProps, "min" | "max"> & {
  minIntensity: number;
  maxIntensity: number;
  isLegacyIntensity: boolean;
}) => {
  const gradientMap = useGradientMap(colorMap);

  return (
    <shaderMaterial
      glslVersion={THREE.GLSL3}
      {...{
        uniforms: {
          uMin: { value: minIntensity },
          uMax: { value: maxIntensity },
          opacity: { value: opacity ?? 1 },
          gradientMap: { value: gradientMap },
          pointSize: { value: pointSize },
          isPointSizeAttenuated: { value: isPointSizeAttenuated },
        },
        vertexShader: isLegacyIntensity
          ? ShadeByLegacyIntensityShaders.vertexShader
          : ShadeByIntensityShaders.vertexShader,
        fragmentShader: isLegacyIntensity
          ? ShadeByLegacyIntensityShaders.fragmentShader
          : ShadeByIntensityShaders.fragmentShader,
      }}
    />
  );
};

export const RgbShader = ({
  pointSize,
  isPointSizeAttenuated,
  opacity,
}: Pick<ShaderProps, "pointSize" | "isPointSizeAttenuated" | "opacity">) => {
  return (
    <shaderMaterial
      glslVersion={THREE.GLSL3}
      {...{
        scale: { value: 1 },
        uniforms: {
          pointSize: { value: pointSize },
          isPointSizeAttenuated: { value: isPointSizeAttenuated },
          opacity: { value: opacity ?? 1 },
        },
        vertexShader: ShadeByRgbShaders.vertexShader,
        fragmentShader: ShadeByRgbShaders.fragmentShader,
      }}
    />
  );
};

export const CustomColorShader = ({
  pointSize,
  isPointSizeAttenuated,
  color,
  opacity,
}: Pick<ShaderProps, "pointSize" | "isPointSizeAttenuated" | "opacity"> & {
  color: string;
}) => {
  const hexColorToVec3 = useMemo(() => {
    const threeColor = new THREE.Color(color);
    return [threeColor.r, threeColor.g, threeColor.b];
  }, [color]);

  return (
    <shaderMaterial
      glslVersion={THREE.GLSL3}
      {...{
        scale: { value: 1 },
        uniforms: {
          pointSize: { value: pointSize },
          isPointSizeAttenuated: { value: isPointSizeAttenuated },
          color: { value: hexColorToVec3 },
          opacity: { value: opacity ?? 1 },
        },
        vertexShader: ShadeByCustomColorShaders.vertexShader,
        fragmentShader: ShadeByCustomColorShaders.fragmentShader,
      }}
    />
  );
};
