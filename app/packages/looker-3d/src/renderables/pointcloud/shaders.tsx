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

const ShadeByRgbShaders = {
  vertexShader: /* glsl */ `
  // this uniform is used to pass the point size to the vertex shader from JS
  uniform float pointSize;

  // these attributes are injected into the vertex shader based on geometry
  attribute vec3 color;
  attribute float scale;

  // this attribute is used to pass the color to the fragment shader
  varying vec3 vColor;

  void main() {
    // assign color to the varying variable so that it can be used in fragment shader
    vColor = color;

    // do a model-view transform to get the position of the point in camera space
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );

    // (scale / length(mvPosition.xyz)) is used to scale the point size based on distance from camera
    gl_PointSize = pointSize * (1.0 / length(mvPosition.xyz));

    // do a projection transform to get the position of the point in clip space
    gl_Position = projectionMatrix * mvPosition;
  }

  `,
  fragmentShader: /* glsl */ `
  varying vec3 vColor;

  void main() {
    gl_FragColor = vec4(vColor, 1.0);
  } 
  `,
};

const ShadeByHeightShaders = {
  vertexShader: /* glsl */ `
  uniform float maxZ;
  uniform float minZ;
  uniform float pointSize;

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

    gl_PointSize = pointSize * (1.0 / length(mvPosition.xyz));
    gl_Position = projectionMatrix * mvPosition;
  }`,
  fragmentShader: /* glsl */ `
  uniform sampler2D gradientMap;
  varying float hValue;

  void main() {
    float v = clamp(hValue, 0., 1.);
    vec3 col = texture2D(gradientMap, vec2(0, v)).rgb;
    gl_FragColor = vec4(col, 1.);
  }`,
};

const ShadeByIntensityShaders = {
  vertexShader: /* glsl */ `
  uniform float max;
  uniform float min;
  uniform float pointSize;

  varying vec2 vUv;
  varying float hValue;
  attribute vec3 color;

  float remap ( float minval, float maxval, float curval ) {
    return ( curval - minval ) / ( maxval - minval );
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    hValue = remap(min, max, color.r);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    gl_PointSize = pointSize * (1.0 / length(mvPosition.xyz));
    gl_Position = projectionMatrix * mvPosition;
  }
`,
  fragmentShader: /* glsl */ `
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
          pointSize: { value: pointSize },
        },
        vertexShader: ShadeByHeightShaders.vertexShader,
        fragmentShader: ShadeByHeightShaders.fragmentShader,
      }}
    />
  );
};

export const ShadeByIntensity = ({
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
          min: { value: min }, // geo.boundingBox.min.z
          max: { value: max },
          gradientMap: { value: gradientMap },
          pointSize: { value: pointSize },
        },
        vertexShader: ShadeByIntensityShaders.vertexShader,
        fragmentShader: ShadeByIntensityShaders.fragmentShader,
      }}
    />
  );
};

export const RgbShader = ({ pointSize }: { pointSize: number }) => {
  return (
    <shaderMaterial
      {...{
        scale: { value: 1 },
        uniforms: {
          pointSize: { value: pointSize },
        },
        vertexShader: ShadeByRgbShaders.vertexShader,
        fragmentShader: ShadeByRgbShaders.fragmentShader,
      }}
    />
  );
};
