import React from "react";
import * as THREE from "three";

function useGradientMap(gradients) {
  return React.useMemo(
    () => new THREE.CanvasTexture(generateTexture(gradients)),
    [gradients]
  );
}

const zVertex = (pointSize) => `
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
  }
`;

const zFragment = `
  uniform sampler2D gradientMap;
  varying float hValue;

  void main() {
    float v = clamp(hValue, 0., 1.);
    vec3 col = texture2D(gradientMap, vec2(0, v)).rgb;
    gl_FragColor = vec4(col, 1.);
  }
`;

export function ShadeByZ({ gradients, minZ, maxZ, pointSize }) {
  const gradientMap = useGradientMap(gradients);

  return (
    <shaderMaterial
      {...{
        uniforms: {
          minZ: { value: minZ },
          maxZ: { value: maxZ },
          gradientMap: { value: gradientMap },
        },
        vertexShader: zVertex(pointSize),
        fragmentShader: zFragment,
      }}
    />
  );
}

function generateTexture(gradients: [number, string][]) {
  var size = 512;

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
}

const intensityVertex = (pointSize) => `
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
`;
var intensityFragment = `
  uniform sampler2D gradientMap;
  varying float hValue;

  void main() {
    float v = clamp(hValue, 0., 1.);
    vec3 col = texture2D(gradientMap, vec2(0, v)).rgb;
    gl_FragColor = vec4(col, 1.);
  }
`;
export function ShadeByIntensity({ min, max, gradients, pointSize }) {
  const gradientMap = useGradientMap(gradients);

  return (
    <shaderMaterial
      {...{
        uniforms: {
          min: { value: min }, // geo.boundingBox.min.z
          max: { value: max },
          gradientMap: { value: gradientMap },
        },
        vertexShader: intensityVertex(pointSize),
        fragmentShader: intensityFragment,
      }}
    />
  );
}
