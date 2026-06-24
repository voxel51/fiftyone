const PointCloudCropVertexDeclarations = /* glsl */ `
  uniform bool pointCloudCropEnabled;
  uniform mat4 pointCloudCropWorldToBox;
  uniform vec3 pointCloudCropHalfSize;

  out float vPointCloudCropVisible;

  bool isInsidePointCloudCrop(vec3 localPosition) {
    if (!pointCloudCropEnabled) {
      return true;
    }

    vec3 boxPosition = (
      pointCloudCropWorldToBox *
      modelMatrix *
      vec4(localPosition, 1.0)
    ).xyz;

    return all(
      lessThanEqual(
        abs(boxPosition),
        pointCloudCropHalfSize + vec3(0.000001)
      )
    );
  }

  void setPointCloudCropVisibility(vec3 localPosition) {
    vPointCloudCropVisible = isInsidePointCloudCrop(localPosition) ? 1.0 : 0.0;
  }

  float croppedPointSize(float requestedPointSize) {
    return vPointCloudCropVisible < 0.5 ? 0.0 : requestedPointSize;
  }
`;

const PointCloudCropFragmentDeclarations = /* glsl */ `
  in float vPointCloudCropVisible;

  void discardPointCloudCrop() {
    if (vPointCloudCropVisible < 0.5) {
      discard;
    }
  }
`;

export const ShadeByRgbShaders = {
  vertexShader: /* glsl */ `
  uniform float pointSize;
  uniform bool isPointSizeAttenuated;

  in vec3 rgb;
  out vec3 vColor;

  ${PointCloudCropVertexDeclarations}

  void main() {
    vec3 pos = position;
    vColor = rgb;
    setPointCloudCropVisibility(pos);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float resolvedPointSize = pointSize * (
      isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0
    );

    gl_PointSize = croppedPointSize(resolvedPointSize);
    gl_Position = projectionMatrix * mvPosition;
  }
  `,
  fragmentShader: /* glsl */ `
  in vec3 vColor;
  uniform float opacity;
  out vec4 fragColor;

  ${PointCloudCropFragmentDeclarations}

  void main() {
    discardPointCloudCrop();
    fragColor = vec4(vColor, opacity);
  }
  `,
};

export const ShadeByHeightShaders = {
  vertexShader: /* glsl */ `
  uniform float max;
  uniform float min;
  uniform vec3 upVector;
  uniform vec4 quaternion;
  uniform float pointSize;
  uniform bool isPointSizeAttenuated;

  out float hValue;

  ${PointCloudCropVertexDeclarations}

  float remap(float minval, float maxval, float curval) {
    return (curval - minval) / (maxval - minval);
  }

  mat3 quaternionToMatrix(vec4 q) {
    float x = q.x, y = q.y, z = q.z, w = q.w;
    return mat3(
      1.0 - 2.0 * y * y - 2.0 * z * z, 2.0 * x * y - 2.0 * w * z, 2.0 * x * z + 2.0 * w * y,
      2.0 * x * y + 2.0 * w * z, 1.0 - 2.0 * x * x - 2.0 * z * z, 2.0 * y * z - 2.0 * w * x,
      2.0 * x * z - 2.0 * w * y, 2.0 * y * z + 2.0 * w * x, 1.0 - 2.0 * x * x - 2.0 * y * y
    );
  }

  void main() {
    vec3 pos = position;
    setPointCloudCropVisibility(pos);

    vec3 rotatedUpVector = upVector;
    if (quaternion.w != 0.0 || quaternion.x != 0.0 || quaternion.y != 0.0 || quaternion.z != 0.0) {
      mat3 rotationMatrix = quaternionToMatrix(quaternion);
      rotatedUpVector = rotationMatrix * upVector;
    }

    float projectedHeight = dot(pos, rotatedUpVector);
    hValue = remap(min, max, projectedHeight);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float resolvedPointSize = pointSize * (
      isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0
    );

    gl_PointSize = croppedPointSize(resolvedPointSize);
    gl_Position = projectionMatrix * mvPosition;
  }`,
  fragmentShader: /* glsl */ `
  uniform sampler2D gradientMap;
  uniform float opacity;
  in float hValue;
  out vec4 fragColor;

  ${PointCloudCropFragmentDeclarations}

  void main() {
    discardPointCloudCrop();
    float v = clamp(hValue, 0., 1.);
    vec3 col = texture(gradientMap, vec2(0.5, v)).rgb;
    fragColor = vec4(col, opacity);
  }`,
};

export const ShadeByIntensityShaders = {
  vertexShader: /* glsl */ `
  in float intensity;
  out float vNorm;
  out float vIntensity;
  uniform float uMax;
  uniform float uMin;
  uniform float pointSize;
  uniform bool isPointSizeAttenuated;
  uniform float thresholdMin;
  uniform float thresholdMax;

  ${PointCloudCropVertexDeclarations}

  float remap ( float minval, float maxval, float curval ) {
    return ( curval - minval ) / ( maxval - minval );
  }

  void main() {
    vec3 pos = position;
    setPointCloudCropVisibility(pos);
    vNorm = clamp(remap(uMin, uMax, intensity), 0.0, 1.0);
    vIntensity = intensity;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float resolvedPointSize = pointSize * (
      isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0
    );

    if (intensity < thresholdMin || intensity > thresholdMax) {
      gl_PointSize = 0.0;
    } else {
      gl_PointSize = croppedPointSize(resolvedPointSize);
    }

    gl_Position = projectionMatrix * mvPosition;
  }
`,
  fragmentShader: /* glsl */ `
  uniform sampler2D gradientMap;
  uniform float opacity;
  uniform float thresholdMin;
  uniform float thresholdMax;
  in float vNorm;
  in float vIntensity;
  out vec4 fragColor;

  ${PointCloudCropFragmentDeclarations}

  void main() {
    discardPointCloudCrop();

    if (vIntensity < thresholdMin || vIntensity > thresholdMax) {
      discard;
    }

    vec3 col = texture(gradientMap, vec2(0.5, vNorm)).rgb;
    fragColor = vec4(col, opacity);
  }
`,
};

export const ShadeByLegacyIntensityShaders = {
  vertexShader: /* glsl */ `
    in vec3 rgb;
    out float vNorm;
    out float vIntensity;
    uniform float uMax;
    uniform float uMin;
    uniform float pointSize;
    uniform bool isPointSizeAttenuated;
    uniform float thresholdMin;
    uniform float thresholdMax;

    ${PointCloudCropVertexDeclarations}

    float remap ( float minval, float maxval, float curval ) {
      return ( curval - minval ) / ( maxval - minval );
    }

    void main() {
      vec3 pos = position;
      setPointCloudCropVisibility(pos);
      float intensity = rgb.r;
      vNorm = clamp(remap(uMin, uMax, intensity), 0.0, 1.0);
      vIntensity = intensity;

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      float resolvedPointSize = pointSize * (
        isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0
      );

      if (intensity < thresholdMin || intensity > thresholdMax) {
        gl_PointSize = 0.0;
      } else {
        gl_PointSize = croppedPointSize(resolvedPointSize);
      }

      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D gradientMap;
    uniform float opacity;
    uniform float thresholdMin;
    uniform float thresholdMax;
    in float vNorm;
    in float vIntensity;
    out vec4 fragColor;

    ${PointCloudCropFragmentDeclarations}

    void main() {
      discardPointCloudCrop();

      if (vIntensity < thresholdMin || vIntensity > thresholdMax) {
        discard;
      }

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

  ${PointCloudCropVertexDeclarations}

  void main() {
    vec3 pos = position;
    vColor = color;
    setPointCloudCropVisibility(pos);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float resolvedPointSize = pointSize * (
      isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0
    );

    gl_PointSize = croppedPointSize(resolvedPointSize);
    gl_Position = projectionMatrix * mvPosition;
  }
`,
  fragmentShader: /* glsl */ `
  in vec3 vColor;
  uniform float opacity;
  out vec4 fragColor;

  ${PointCloudCropFragmentDeclarations}

  void main() {
    discardPointCloudCrop();
    fragColor = vec4(vColor, opacity);
  }
`,
};

export const ShadeByVertexColorShaders = {
  vertexShader: /* glsl */ `
  uniform float pointSize;
  uniform bool isPointSizeAttenuated;
  in vec3 color;
  out vec3 vColor;

  ${PointCloudCropVertexDeclarations}

  void main() {
    vec3 pos = position;
    vColor = color;
    setPointCloudCropVisibility(pos);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float resolvedPointSize = pointSize * (
      isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0
    );

    gl_PointSize = croppedPointSize(resolvedPointSize);
    gl_Position = projectionMatrix * mvPosition;
  }
`,
  fragmentShader: /* glsl */ `
  in vec3 vColor;
  uniform float opacity;
  out vec4 fragColor;

  ${PointCloudCropFragmentDeclarations}

  void main() {
    discardPointCloudCrop();
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
  uniform float thresholdMin;
  uniform float thresholdMax;

  in float dynamicAttr;
  out float vNorm;
  out float vAttrValue;

  ${PointCloudCropVertexDeclarations}

  float remap(float minval, float maxval, float curval) {
    return (curval - minval) / (maxval - minval);
  }

  void main() {
    vec3 pos = position;
    setPointCloudCropVisibility(pos);
    vNorm = clamp(remap(uMin, uMax, dynamicAttr), 0.0, 1.0);
    vAttrValue = dynamicAttr;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float resolvedPointSize = pointSize * (
      isPointSizeAttenuated ? (1.0 / length(mvPosition.xyz)) : 1.0
    );

    if (dynamicAttr < thresholdMin || dynamicAttr > thresholdMax) {
      gl_PointSize = 0.0;
    } else {
      gl_PointSize = croppedPointSize(resolvedPointSize);
    }

    gl_Position = projectionMatrix * mvPosition;
  }
  `,
  fragmentShader: /* glsl */ `
  uniform sampler2D gradientMap;
  uniform float opacity;
  uniform float thresholdMin;
  uniform float thresholdMax;
  in float vNorm;
  in float vAttrValue;
  out vec4 fragColor;

  ${PointCloudCropFragmentDeclarations}

  void main() {
    discardPointCloudCrop();

    if (vAttrValue < thresholdMin || vAttrValue > thresholdMax) {
      discard;
    }

    vec3 col = texture(gradientMap, vec2(0.5, vNorm)).rgb;
    fragColor = vec4(col, opacity);
  }
  `,
};
