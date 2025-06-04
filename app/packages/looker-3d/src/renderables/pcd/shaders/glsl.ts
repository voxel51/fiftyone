export const ShadeByRgbShaders = {
  vertexShader: /* glsl */ `
  // this uniform is used to pass the point size to the vertex shader from JS
  uniform float pointSize;

  // this uniform is used to indicate whether the point size should be attenuated based on distance from camera
  uniform bool isPointSizeAttenuated;

  // these attributes are injected into the vertex shader based on geometry
  in vec3 rgb;

  // this attribute is used to pass the color to the fragment shader
  out vec3 vColor;

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
  in vec3 vColor;
  
  // this uniform is used to pass the opacity
  uniform float opacity;

  out vec4 fragColor;

  void main() {
    fragColor = vec4(vColor, opacity);
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

  out float hValue;

  float remap(float minval, float maxval, float curval) {
    return (curval - minval) / (maxval - minval);
  }

  void main() {
    vec3 pos = position;
    float projectedHeight = dot(pos, upVector);
    hValue = remap(min, max, projectedHeight);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    gl_PointSize = pointSize * (isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }`,
  fragmentShader: /* glsl */ `
  uniform sampler2D gradientMap;
  uniform float opacity;
  in float hValue;
  out vec4 fragColor;

  void main() {
    float v = clamp(hValue, 0., 1.);
    // sample from the middle of the gradient map to avoid border artifacts
    vec3 col = texture(gradientMap, vec2(0.5, v)).rgb;
    fragColor = vec4(col, opacity);
  }`,
};

export const ShadeByIntensityShaders = {
  vertexShader: /* glsl */ `
  in float intensity;
  out float vNorm;
  uniform float uMax;
  uniform float uMin;
  uniform float pointSize;
  uniform bool isPointSizeAttenuated;

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

export const ShadeByLegacyIntensityShaders = {
  vertexShader: /* glsl */ `
    in vec3 rgb;
    out float vNorm;
    uniform float uMax;
    uniform float uMin;
    uniform float pointSize;
    uniform bool isPointSizeAttenuated;
  
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
    uniform sampler2D gradientMap;
    uniform float opacity;
    in float vNorm;
    out vec4 fragColor;
  
    void main() {
      // sample from the middle of the gradient map to avoid border artifacts
      vec3 col = texture(gradientMap, vec2(0.5, vNorm)).rgb;
      fragColor = vec4(col, opacity);
    }
  `,
};

export const ShadeByCustomColorShaders = {
  vertexShader: /* glsl */ `
  uniform float pointSize;
  uniform bool isPointSizeAttenuated;
  uniform vec3 color;
  out vec3 vColor;

  void main() {
    vColor = color;

    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_PointSize = pointSize * (isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0);    gl_Position = projectionMatrix * mvPosition;
    gl_Position = projectionMatrix * mvPosition;
  }
`,
  fragmentShader: /* glsl */ `
  in vec3 vColor;

  uniform float opacity;

  out vec4 fragColor;

  void main() {
    fragColor = vec4(vColor, opacity);
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
