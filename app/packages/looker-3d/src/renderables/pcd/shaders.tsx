import React, { useCallback, useMemo } from "react";
import * as THREE from "three";

export type Gradients = [number, string][];

export type ShaderProps = {
  gradients: Gradients;
  min: number;
  max: number;
  pointSize: number;
  isPointSizeAttenuated: boolean;
  opacity?: number;
  upVector?: THREE.Vector3;
  pcdType?: "intensity" | "rgb";
};

const useGradientMap = (gradients: Gradients, flipY: boolean = false) => {
  const generateTexture = useCallback((gradients: Gradients, flip: boolean) => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const grad = ctx.createLinearGradient(0, 0, 0, size);
    for (const [stop, col] of gradients) {
      grad.addColorStop(stop, col);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = flip;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }, []);

  return React.useMemo(
    () => generateTexture(gradients, flipY),
    [gradients, generateTexture]
  );
};

const ShadeByRgbShaders = {
  vertexShader: /* glsl */ `
  // this uniform is used to pass the point size to the vertex shader from JS
  uniform float pointSize;

  // this uniform is used to indicate whether the point size should be attenuated based on distance from camera
  uniform bool isPointSizeAttenuated;

  // these attributes are injected into the vertex shader based on geometry
  attribute vec3 color;

  // this attribute is used to pass the color to the fragment shader
  varying vec3 vColor;

  void main() {
    // assign color to the varying variable so that it can be used in fragment shader
    vColor = color;

    // do a model-view transform to get the position of the point in camera space
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );

    // (1.0 / length(mvPosition.xyz)) is used to scale the point size based on distance from camera
    gl_PointSize = pointSize * (isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0);

    // do a projection transform to get the position of the point in clip space
    gl_Position = projectionMatrix * mvPosition;
  }

  `,
  fragmentShader: /* glsl */ `
  varying vec3 vColor;
  
  // this uniform is used to pass the opacity
  uniform float opacity;

  void main() {
    gl_FragColor = vec4(vColor, opacity);
  } 
  `,
};

const ShadeByHeightShaders = {
  vertexShader: /* glsl */ `
  uniform float max;
  uniform float min;
  uniform vec3 upVector;
  uniform float pointSize;
  uniform bool isPointSizeAttenuated;

  varying vec2 vUv;
  varying float hValue;

  float remap(float minval, float maxval, float curval) {
    return (curval - minval) / (maxval - minval);
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    float projectedHeight = dot(pos, upVector);
    hValue = remap(min, max, projectedHeight);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    gl_PointSize = pointSize * (isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }`,
  fragmentShader: /* glsl */ `
  uniform sampler2D gradientMap;
  varying float hValue;

  uniform float opacity;

  void main() {
    float v = clamp(hValue, 0., 1.);
    vec3 col = texture2D(gradientMap, vec2(0, v)).rgb;
    gl_FragColor = vec4(col, opacity);
  }`,
};

const ShadeByIntensityShaders = {
  vertexShader: /* glsl */ `
  precision highp float;
  
  uniform float uMax;
  uniform float uMin;
  uniform float pointSize;
  uniform bool isPointSizeAttenuated;

  varying float vNorm;

  attribute float intensity;

  float remap ( float minval, float maxval, float curval ) {
    return ( curval - minval ) / ( maxval - minval );
  }

  float logRemap(float mn, float mx, float val){
    float v = (log(val) - log(mn)) / (log(mx)-log(mn));
    return clamp(v, 0., 1.);
  }

  void main() {
    vec3 pos = position;
    vNorm = clamp(remap(uMin, uMax, intensity), 0.0, 1.0);
    // vNorm = clamp(logRemap(uMin, uMax, intensity), 0.0, 1.0);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    gl_PointSize = pointSize * (isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`,
  fragmentShader: /* glsl */ `
  precision highp float;

  uniform sampler2D gradientMap;
  uniform float opacity;

  varying float vNorm;

  void main() {
    vec3 col = texture2D(gradientMap, vec2(0.5, vNorm)).rgb;
    gl_FragColor = vec4(col, opacity);
  }
`,
};

// legacy intensity = use r channel of rgb
const ShadeByLegacyIntensityShaders = {
  vertexShader: /* glsl */ `
    uniform float uMax;
    uniform float uMin;
    uniform float pointSize;
    uniform bool isPointSizeAttenuated;
  
    varying float hValue;
    attribute vec3 color;
  
    float remap ( float minval, float maxval, float curval ) {
      return ( curval - minval ) / ( maxval - minval );
    }
  
    void main() {
      vec3 pos = position;
      hValue = remap(uMin, uMax, color.r);
  
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  
      gl_PointSize = pointSize * (isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D gradientMap;
    varying float hValue;
  
    uniform float opacity;
  
    void main() {
      float v = clamp(hValue, 0., 1.);
      vec3 col = texture2D(gradientMap, vec2(0, v)).rgb;
      gl_FragColor = vec4(col, opacity);
    }
  `,
};

const ShadeByCustomColorShaders = {
  vertexShader: /* glsl */ `
  uniform float pointSize;
  uniform bool isPointSizeAttenuated;
  uniform vec3 color;

  // vColor will be assigned to color for frgament shader
  varying vec3 vColor;

  void main() {
    vColor = color;

    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_PointSize = pointSize * (isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0);    gl_Position = projectionMatrix * mvPosition;
    gl_Position = projectionMatrix * mvPosition;
  }
`,
  fragmentShader: /* glsl */ `
  varying vec3 vColor;

  uniform float opacity;

  void main() {
    gl_FragColor = vec4(vColor, opacity);
  }
`,
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
  pcdType,
}: Omit<ShaderProps, "min" | "max"> & {
  minIntensity: number;
  maxIntensity: number;
}) => {
  const gradientMap = useGradientMap(gradients, true);

  const isLegacyIntensity = useMemo(() => {
    return pcdType !== "intensity";
  }, [pcdType]);

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
