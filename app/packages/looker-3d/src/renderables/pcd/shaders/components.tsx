import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  DynamicAttributeShaders,
  ShadeByCustomColorShaders,
  ShadeByHeightShaders,
  ShadeByIntensityShaders,
  ShadeByLegacyIntensityShaders,
  ShadeByRgbShaders,
  ShadeByVertexColorShaders,
} from "./glsl";
import useGradientMap from "./gradientMap";
import type { ShaderProps } from "./types";

const DISABLED_POINT_CLOUD_CROP_WORLD_TO_BOX = new THREE.Matrix4();
const DISABLED_POINT_CLOUD_CROP_HALF_SIZE = new THREE.Vector3();

const usePointCloudCropUniforms = (
  pointCloudCrop: ShaderProps["pointCloudCrop"]
) =>
  useMemo(
    () => ({
      pointCloudCropEnabled: { value: Boolean(pointCloudCrop) },
      pointCloudCropWorldToBox: {
        value:
          pointCloudCrop?.worldToBox ?? DISABLED_POINT_CLOUD_CROP_WORLD_TO_BOX,
      },
      pointCloudCropHalfSize: {
        value: pointCloudCrop?.halfSize ?? DISABLED_POINT_CLOUD_CROP_HALF_SIZE,
      },
    }),
    [pointCloudCrop]
  );

export const DynamicAttributeShader = ({
  attribute,
  min,
  max,
  pointSize,
  isPointSizeAttenuated,
  opacity,
  geometry,
  colorMap,
  thresholdMin,
  thresholdMax,
  pointCloudCrop,
}: ShaderProps & {
  attribute: string;
  geometry: THREE.BufferGeometry;
  thresholdMin?: number;
  thresholdMax?: number;
}) => {
  const gradientMap = useGradientMap(colorMap);
  const pointCloudCropUniforms = usePointCloudCropUniforms(pointCloudCrop);

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
        thresholdMin: { value: thresholdMin ?? min },
        thresholdMax: { value: thresholdMax ?? max },
        ...pointCloudCropUniforms,
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
  quaternion,
  pointSize,
  opacity,
  isPointSizeAttenuated,
  pointCloudCrop,
}: ShaderProps) => {
  const gradientMap = useGradientMap(colorMap);
  const pointCloudCropUniforms = usePointCloudCropUniforms(pointCloudCrop);
  const upVectorVec3 = useMemo(() => {
    return [upVector.x, upVector.y, upVector.z];
  }, [upVector]);

  const quaternionVec4 = useMemo(() => {
    return quaternion
      ? [quaternion.x, quaternion.y, quaternion.z, quaternion.w]
      : [0, 0, 0, 1];
  }, [quaternion]);

  return (
    <shaderMaterial
      glslVersion={THREE.GLSL3}
      {...{
        uniforms: {
          opacity: { value: opacity ?? 1 },
          min: { value: min },
          max: { value: max },
          upVector: { value: upVectorVec3 },
          quaternion: { value: quaternionVec4 },
          gradientMap: { value: gradientMap },
          pointSize: { value: pointSize },
          isPointSizeAttenuated: { value: isPointSizeAttenuated },
          ...pointCloudCropUniforms,
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
  thresholdMin,
  thresholdMax,
  pointCloudCrop,
}: Omit<ShaderProps, "min" | "max"> & {
  minIntensity: number;
  maxIntensity: number;
  isLegacyIntensity: boolean;
  thresholdMin?: number;
  thresholdMax?: number;
}) => {
  const gradientMap = useGradientMap(colorMap);
  const pointCloudCropUniforms = usePointCloudCropUniforms(pointCloudCrop);

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
          thresholdMin: { value: thresholdMin ?? minIntensity },
          thresholdMax: { value: thresholdMax ?? maxIntensity },
          ...pointCloudCropUniforms,
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
  pointCloudCrop,
}: Pick<
  ShaderProps,
  "pointSize" | "isPointSizeAttenuated" | "opacity" | "pointCloudCrop"
>) => {
  const pointCloudCropUniforms = usePointCloudCropUniforms(pointCloudCrop);

  return (
    <shaderMaterial
      glslVersion={THREE.GLSL3}
      {...{
        scale: { value: 1 },
        uniforms: {
          pointSize: { value: pointSize },
          isPointSizeAttenuated: { value: isPointSizeAttenuated },
          opacity: { value: opacity ?? 1 },
          ...pointCloudCropUniforms,
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
  pointCloudCrop,
}: Pick<ShaderProps, "pointSize" | "isPointSizeAttenuated" | "opacity"> & {
  color: string;
  pointCloudCrop?: ShaderProps["pointCloudCrop"];
}) => {
  const hexColorToVec3 = useMemo(() => {
    const threeColor = new THREE.Color(color);
    return [threeColor.r, threeColor.g, threeColor.b];
  }, [color]);
  const pointCloudCropUniforms = usePointCloudCropUniforms(pointCloudCrop);

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
          ...pointCloudCropUniforms,
        },
        vertexShader: ShadeByCustomColorShaders.vertexShader,
        fragmentShader: ShadeByCustomColorShaders.fragmentShader,
      }}
    />
  );
};

export const VertexColorShader = ({
  pointSize,
  isPointSizeAttenuated,
  opacity,
  pointCloudCrop,
}: Pick<
  ShaderProps,
  "pointSize" | "isPointSizeAttenuated" | "opacity" | "pointCloudCrop"
>) => {
  const pointCloudCropUniforms = usePointCloudCropUniforms(pointCloudCrop);

  return (
    <shaderMaterial
      glslVersion={THREE.GLSL3}
      {...{
        scale: { value: 1 },
        uniforms: {
          pointSize: { value: pointSize },
          isPointSizeAttenuated: { value: isPointSizeAttenuated },
          opacity: { value: opacity ?? 1 },
          ...pointCloudCropUniforms,
        },
        vertexShader: ShadeByVertexColorShaders.vertexShader,
        fragmentShader: ShadeByVertexColorShaders.fragmentShader,
      }}
    />
  );
};
