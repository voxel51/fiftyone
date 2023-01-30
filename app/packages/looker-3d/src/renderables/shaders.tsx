import React, { useCallback } from "react";
import * as THREE from "three";

export type Gradients = [number, string][];

export type ShaderProps = {
  gradients: Gradients;
  min: number;
  max: number;
  pointSize: number;
};

const useGradientMap = (gradients: Gradients) => {
  const generateTexture = useCallback((gradients: Gradients) => {
    const size = 512;

    // create canvas
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    // get context
    const context = canvas.getContext("2d");

    // draw gradient
    context.rect(0, 0, size, size);
    const gradient = context.createLinearGradient(0, 0, 0, size);
    for (const g of gradients) {
      gradient.addColorStop(...g);
    }
    context.fillStyle = gradient;
    context.fill();

    return canvas;
  }, []);

  return React.useMemo(
    () => new THREE.CanvasTexture(generateTexture(gradients)),
    [gradients, generateTexture]
  );
};

const ColorByHeightShaders = {
  vertexShader: (pointSize: number) => `
  uniform float maxZ;
  uniform float minZ;
  varying vec2 vUv;
  varying float hValue;

  float remap ( float minval, float maxval, float curval ) {
    return ( curval - minval ) / ( maxval - minval );
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    hValue = remap(minZ, maxZ, pos.z);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    gl_PointSize = 80. * (1. / - mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }`,
  fragmentShader: `
  uniform sampler2D gradientMap;
  varying float hValue;

  void main() {
    float v = clamp(hValue, 0., 1.);
    vec3 col = texture2D(gradientMap, vec2(0, v)).rgb;
    gl_FragColor = vec4(col, 1.);
  }`,
};

const ColorByIntensityShaders = {
  vertexShader: (pointSize: number) => `
  uniform float max;
  uniform float min;
  varying vec2 vUv;
  varying float hValue;
  attribute vec3 color;

  float remap ( float minval, float maxval, float curval ) {
    return ( curval - minval ) / ( maxval - minval );
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    hValue = remap(min, max, color.x);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    gl_PointSize = 80. * (1. / - mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`,
  fragmentShader: `
  uniform sampler2D gradientMap;
  varying float hValue;

  void main() {
    float v = clamp(hValue, 0., 1.);
    vec3 col = texture2D(gradientMap, vec2(0, v)).rgb;
    gl_FragColor = vec4(col, 1.);
  }
`,
};

export const ShadeByHeight = ({
  gradients,
  min,
  max,
  pointSize,
}: ShaderProps) => {
  const gradientMap = useGradientMap(gradients);

  return (
    <shaderMaterial
      {...{
        uniforms: {
          minZ: { value: min },
          maxZ: { value: max },
          gradientMap: { value: gradientMap },
        },
        vertexShader: ColorByHeightShaders.vertexShader(pointSize),
        fragmentShader: ColorByHeightShaders.fragmentShader,
      }}
    />
  );
};

export function ShadeByIntensity({
  gradients,
  min,
  max,
  pointSize,
}: ShaderProps) {
  const gradientMap = useGradientMap(gradients);

  return (
    <shaderMaterial
      {...{
        uniforms: {
          min: { value: min }, // geo.boundingBox.min.z
          max: { value: max },
          gradientMap: { value: gradientMap },
        },
        vertexShader: ColorByIntensityShaders.vertexShader(pointSize),
        fragmentShader: ColorByIntensityShaders.fragmentShader,
      }}
    />
  );
}
