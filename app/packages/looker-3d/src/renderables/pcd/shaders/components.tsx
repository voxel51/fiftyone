import { useMemo } from "react";
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
import type { Gradients, ShaderProps } from "./types";

export const DynamicAttributeShader = ({
  attribute,
  min,
  max,
  gradients,
  pointSize,
  isPointSizeAttenuated,
  opacity,
  geometry,
}: {
  attribute: string;
  min: number;
  max: number;
  gradients: Gradients;
  pointSize: number;
  isPointSizeAttenuated: boolean;
  opacity?: number;
  geometry: THREE.BufferGeometry;
}) => {
  const gradientMap = useGradientMap(gradients);
  if (geometry && geometry.hasAttribute(attribute)) {
    geometry.setAttribute("dynamicAttr", geometry.getAttribute(attribute));
  }
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
  gradients,
  min,
  max,
  upVector,
  pointSize,
  opacity,
  isPointSizeAttenuated,
}: ShaderProps) => {
  const gradientMap = useGradientMap(gradients);
  const upVectorVec3 = useMemo(() => {
    return [upVector.x, upVector.y, upVector.z];
  }, [upVector]);

  return (
    <shaderMaterial
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
  gradients,
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
  const gradientMap = useGradientMap(gradients);

  return (
    <shaderMaterial
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
