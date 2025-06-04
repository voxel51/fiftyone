export const ShadeByRgbShaders = {
  vertexShader: /* glsl */ `
  // this uniform is used to pass the point size to the vertex shader from JS
  uniform float pointSize;

  // this uniform is used to indicate whether the point size should be attenuated based on distance from camera
  uniform bool isPointSizeAttenuated;

  // these attributes are injected into the vertex shader based on geometry
  attribute vec3 rgb;

  // this attribute is used to pass the color to the fragment shader
  varying vec3 vColor;

  void main() {
    // assign color to the varying variable so that it can be used in fragment shader
    vColor = rgb;

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

export const ShadeByHeightShaders = {
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
    // sample from the middle of the gradient map to avoid border artifacts
    vec3 col = texture2D(gradientMap, vec2(0.5, v)).rgb;
    gl_FragColor = vec4(col, opacity);
  }`,
};

export const ShadeByIntensityShaders = {
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

  void main() {
    vec3 pos = position;
    vNorm = clamp(remap(uMin, uMax, intensity), 0.0, 1.0);

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

export const ShadeByLegacyIntensityShaders = {
  vertexShader: /* glsl */ `
    uniform float uMax;
    uniform float uMin;
    uniform float pointSize;
    uniform bool isPointSizeAttenuated;
  
    varying float vNorm;
    attribute vec3 rgb;
  
    float remap ( float minval, float maxval, float curval ) {
      return ( curval - minval ) / ( maxval - minval );
    }
  
    void main() {
      vec3 pos = position;
      vNorm = clamp(remap(uMin, uMax, rgb.r), 0.0, 1.0);
  
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
      // sample from the middle of the gradient map to avoid border artifacts
      vec3 col = texture2D(gradientMap, vec2(0.5, vNorm)).rgb;
      gl_FragColor = vec4(col, opacity);
    }
  `,
};

export const ShadeByCustomColorShaders = {
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

export const DynamicAttributeShaders = {
  vertexShader: /* glsl */ `
  uniform float uMax;
  uniform float uMin;
  uniform float pointSize;
  uniform bool isPointSizeAttenuated;

  in float dynamicAttr;
  out float vNorm;

  float remap(float minval, float maxval, float curval) {
    return (curval - minval) / (maxval - minval);
  }

  void main() {
    vNorm = clamp(remap(uMin, uMax, dynamicAttr), 0.0, 1.0);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = pointSize * (isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
  `,
  fragmentShader: /* glsl */ `
  uniform sampler2D gradientMap;
  uniform float opacity;
  in float vNorm;
  out vec4 fragColor;

  void main() {
    vec3 col = texture(gradientMap, vec2(0.5, vNorm)).rgb;
    fragColor = vec4(col, opacity);
  }
  `,
};
