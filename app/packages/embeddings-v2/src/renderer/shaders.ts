// All GLSL lives here — the shaders ARE the renderer; the host library
// is a commodity. This file is the swap point for visual experiments.
import { BASE_ALPHA, DIM_ALPHA } from "./constants";

// One vertex shader for every camera adapter: projectionMatrix ·
// modelViewMatrix covers any projection (three.js binds both for
// RawShaderMaterial when declared). Selection never recolors or
// resizes — emphasized points
// keep their exact style, everything else dims via vWeight. Visibility
// is a separate mechanism: visible=0 points (view-stage subsetting)
// clip out entirely, costing only a vertex shader run.
export const POINTS_VERTEX = /* glsl */ `
  precision highp float;

  attribute vec3 position;
  attribute vec3 color;
  attribute float emphasis;
  attribute float visible;

  uniform mat4 projectionMatrix;
  uniform mat4 modelViewMatrix;
  uniform float uPointSize;
  uniform float uHasSelection;

  varying vec3 vColor;
  varying float vWeight;

  void main() {
    vColor = color;
    vWeight = mix(1.0, mix(${DIM_ALPHA}, 1.0, emphasis), uHasSelection);
    if (visible < 0.5) {
      // Outside the clip volume (z > w): never rasterized
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uPointSize;
  }
`;

// uMode: 0 = alpha compositing, 1 = density accumulation, 2 = opaque
export const POINTS_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uMode;
  uniform float uOpacity;

  varying vec3 vColor;
  varying float vWeight;

  void main() {
    float dist = length(gl_PointCoord - 0.5);
    if (uMode > 1.5) {
      // opaque(ish): depth-tested occlusion, AA edges via blending, and
      // uOpacity leaves a hint of see-through. Unsorted, so at low
      // opacity rear points pop instead of fading — keep it near 1.
      // Dimming darkens (a depth-written low-alpha point would block
      // whatever sits behind it)
      float edge = 1.0 - smoothstep(0.4, 0.5, dist);
      if (edge == 0.0) discard;
      gl_FragColor = vec4(vColor * vWeight, edge * uOpacity);
    } else {
      float edge = 1.0 - smoothstep(0.4, 0.5, dist);
      if (edge == 0.0) discard;
      float w = edge * vWeight;
      // density: premultiplied (color·w, w) for additive accumulation;
      // alpha: plain (color, coverage·alpha) for classic compositing
      gl_FragColor = mix(
        vec4(vColor, w * ${BASE_ALPHA}),
        vec4(vColor * w, w),
        uMode
      );
    }
  }
`;

/**
 * Density tone map (screen pass). Input: additively accumulated
 * rgb = sum(pointColor · weight), a = sum(weight). A single point stays
 * clearly visible; piles asymptote to full opacity and glow toward
 * white so thousands-deep cores read differently than ten-deep.
 *
 * uGamma reshapes the curve around d=1 (pow(1, g) == 1, so a single
 * point's visibility never changes); uGlow scales the white-glow term
 * (0 = piles keep their label hue); uAlphaSingle is the alpha of an
 * isolated point. Returns non-premultiplied rgba.
 */
export const TONEMAP_GLSL = /* glsl */ `
  uniform float uGamma;
  uniform float uGlow;
  uniform float uAlphaSingle;

  vec4 toneMap(vec4 acc) {
    if (acc.a <= 0.0) return vec4(0.0);
    // rgb summed color*weight and a summed weight, so rgb/a is the
    // density-weighted average color at this pixel
    vec3 base = acc.rgb / acc.a;
    float d = pow(acc.a, uGamma);
    // Opacity: linear ramp up to the single-point alpha while coverage
    // is partial (d < 1), then exponential saturation toward 1.0 as the
    // pile deepens (d=2 ≈ 0.7, d=5 ≈ 0.95)
    float alpha = uAlphaSingle * min(d, 1.0) +
      (1.0 - uAlphaSingle) * (1.0 - exp(-max(d - 1.0, 0.0) * 0.35));
    // Glow: blend toward white with the log of density so 1000-deep
    // cores read hotter than 10-deep ones; capped at 45% so the point
    // hue stays recognizable
    vec3 color = mix(base, vec3(1.0), uGlow * min(0.45, 0.06 * log2(1.0 + d)));
    return vec4(color, alpha);
  }
`;

export const SCREEN_VERTEX = /* glsl */ `
  precision highp float;

  attribute vec2 position;
  varying vec2 vUv;

  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

export const SCREEN_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform sampler2D uAcc;

  ${TONEMAP_GLSL}

  void main() {
    vec4 mapped = toneMap(texture2D(uAcc, vUv));
    if (mapped.a <= 0.0) discard;
    gl_FragColor = mapped;
  }
`;
