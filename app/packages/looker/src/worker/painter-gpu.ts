import { OverlayMask } from "../numpy";

// note: for POC only
export function getColorForCategoryTesting(cat: number): number {
  if (cat === 1) return 0xff_00_00_ff;
  if (cat === 2) return 0x00_ff_00_ff;
  if (cat === 3) return 0x00_00_ff_ff;
  return 0x00_00_00_00; // transparent
}

const createShader = (
  gl: WebGL2RenderingContext,
  source: string,
  type: number
): WebGLShader => {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("shader compile error: " + msg);
  }
  return shader;
};

const createProgram = (
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string
): WebGLProgram => {
  const vs = createShader(gl, vsSource, gl.VERTEX_SHADER);
  const fs = createShader(gl, fsSource, gl.FRAGMENT_SHADER);
  const program = gl.createProgram()!;

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const msg = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error("program link error: " + msg);
  }

  // can detach and delete now that it’s linked
  gl.detachShader(program, vs);
  gl.detachShader(program, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  return program;
};

/** create a 256x1 look up texture for category -> RGBA */
const createLUTTexture = (
  gl: WebGL2RenderingContext,
  getColorForCategory: (cat: number) => number
): WebGLTexture => {
  const lutSize = 256;
  const lutData = new Uint8Array(lutSize * 4);

  for (let i = 0; i < lutSize; i++) {
    const rgba32 = getColorForCategory(i);
    lutData[i * 4 + 0] = (rgba32 >>> 24) & 0xff; // R
    lutData[i * 4 + 1] = (rgba32 >>> 16) & 0xff; // G
    lutData[i * 4 + 2] = (rgba32 >>> 8) & 0xff; // B
    lutData[i * 4 + 3] = (rgba32 >>> 0) & 0xff; // A
  }

  const lutTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, lutTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    lutSize,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    lutData
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return lutTex;
};

// pipeline to reuse for every render
export interface SegmentationPipeline {
  canvas: OffscreenCanvas;
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  lutTex: WebGLTexture;
}

export function initSegmentationPipeline(
  getColorForCategory: (cat: number) => number
): SegmentationPipeline {
  const canvas = new OffscreenCanvas(1, 1);
  const gl = canvas.getContext("webgl2");

  // todo: fallback strategy...?
  if (!gl) {
    throw new Error("WebGL2 not supported in this browser/environment");
  }

  // vertex shader
  const vsSource = `#version 300 es
    layout(location = 0) in vec2 aPosition;
    out vec2 vTexCoord;
    void main() {
      // map aPosition from [-1..1] to [0..1] texture coords
      vTexCoord = (aPosition + 1.0) * 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  // fragment shader
  const fsSource = `#version 300 es
    precision mediump float;
    in vec2 vTexCoord;
    out vec4 outColor;

    uniform sampler2D uMaskTex; 
    uniform sampler2D uLutTex;

    void main() {
      // mask.r is in [0..1], multiply by 255 to get category
      float catId = texture(uMaskTex, vTexCoord).r;
      float index = catId * 255.0;
      
      // sample LUT at (index + 0.5)/256.0, single row at y=0.5
      outColor = texture(uLutTex, vec2((index + 0.5)/256.0, 0.5));
    }
  `;

  // compile + link program once
  const program = createProgram(gl, vsSource, fsSource);

  // VAO for the fullscreen quad
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  // fullscreen quad positions
  const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

  // enable the attribute location 0 for aPosition
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // unbind
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // create a LUT texture for category->color
  const lutTex = createLUTTexture(gl, getColorForCategory);

  return { canvas, gl, program, vao, lutTex };
}

export const renderSegmentationMask = (
  pipeline: SegmentationPipeline,
  mask: OverlayMask
): Uint8Array => {
  const { canvas, gl, program, vao, lutTex } = pipeline;

  const [height, width] = mask.shape;
  canvas.width = width;
  canvas.height = height;

  // upload the mask data as a R8 texture
  const maskData = new Uint8Array(mask.buffer);
  const maskTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, maskTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    // internl format
    gl.R8,
    width,
    height,
    0,
    // src format
    gl.RED,
    gl.UNSIGNED_BYTE,
    maskData
  );

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.viewport(0, 0, width, height);
  gl.useProgram(program);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, lutTex);

  // set uniforms (maskTex -> unit 0, lutTex -> unit 1)
  const maskTexLoc = gl.getUniformLocation(program, "uMaskTex");
  const lutTexLoc = gl.getUniformLocation(program, "uLutTex");
  gl.uniform1i(maskTexLoc, 0);
  gl.uniform1i(lutTexLoc, 1);

  // draw fullscreen quad
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // read back the painted pixels
  const paintedPixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, paintedPixels);

  // cleanup
  gl.bindVertexArray(null);
  gl.useProgram(null);
  gl.deleteTexture(maskTex);

  return paintedPixels;
};
