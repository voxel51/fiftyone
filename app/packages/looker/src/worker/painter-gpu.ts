import { OverlayMask } from "../numpy";

const canvas = new OffscreenCanvas(1, 1);
const gl = canvas.getContext("webgl2");
// todo: have a fallback strategy?
if (!gl) throw new Error("webgl2 not supported in this browser");

export const renderSegmentationMask = (
  mask: OverlayMask,
  getColorForCategory: (cat: number) => number
) => {
  const [height, width] = mask.shape;
  canvas.width = width;
  canvas.height = height;

  const maskData = new Uint8Array(mask.buffer);

  // vertex shader:
  // render full-screen quad. we'll compute textre coords from aPosition
  const vsSource = `#version 300 es
      layout(location = 0) in vec2 aPosition;
      out vec2 vTexCoord;
      void main() {
        // Map aPosition -1..1 to 0..1 texture coords
        vTexCoord = (aPosition + 1.0) * 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

  // fragment shader:
  //  - sample the mask texture to get an 8-bit ID in [0..1].
  //  - convert that to [0..255], then sample the LUT texture.
  const fsSource = `#version 300 es
      precision mediump float;
  
      in vec2 vTexCoord;
      out vec4 outColor;
  
      // R8
      uniform sampler2D uMaskTex; 
      // RGBA8 (256 x 1)
      uniform sampler2D uLutTex;
  
      void main() {
        float catId = texture(uMaskTex, vTexCoord).r;   // catId in [0..1]
        float index = catId * 255.0;                    // [0..255]
        // sample the LUT at x = (index + 0.5)/256.0, y=0.5 (a single row)
        outColor = texture(uLutTex, vec2((index + 0.5)/256.0, 0.5));
      }
    `;

  function createShader(
    glCtx: WebGL2RenderingContext,
    source: string,
    type: number
  ) {
    const shader = glCtx.createShader(type)!;
    glCtx.shaderSource(shader, source);
    glCtx.compileShader(shader);

    if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
      const msg = glCtx.getShaderInfoLog(shader);
      glCtx.deleteShader(shader);
      throw new Error("Shader compile error: " + msg);
    }

    return shader;
  }

  function createProgram(
    glCtx: WebGL2RenderingContext,
    vs: string,
    fs: string
  ) {
    const vShader = createShader(glCtx, vs, glCtx.VERTEX_SHADER);
    const fShader = createShader(glCtx, fs, glCtx.FRAGMENT_SHADER);
    const prog = glCtx.createProgram()!;
    glCtx.attachShader(prog, vShader);
    glCtx.attachShader(prog, fShader);
    glCtx.linkProgram(prog);

    if (!glCtx.getProgramParameter(prog, glCtx.LINK_STATUS)) {
      const msg = glCtx.getProgramInfoLog(prog);
      glCtx.deleteProgram(prog);
      throw new Error("Program link error: " + msg);
    }

    return prog;
  }

  const program = createProgram(gl, vsSource, fsSource);

  // create full screen quad
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);

  // mask as r8 texture (todo: different for rgb masks)
  const maskTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, maskTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R8,
    width,
    height,
    0,
    gl.RED,
    gl.UNSIGNED_BYTE,
    maskData
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // build a look up table (lut) texture (256 x 1) for category-color
  // assume maskData fits in 0..255
  const lutSize = 256;
  const lutData = new Uint8Array(lutSize * 4);
  for (let i = 0; i < lutSize; i++) {
    const rgba32 = getColorForCategory(i);
    // red (bits 24-31)
    lutData[i * 4 + 0] = (rgba32 >>> 24) & 0xff;
    // green (bits 16-23)
    lutData[i * 4 + 1] = (rgba32 >>> 16) & 0xff;
    // blue (bits 8-15)
    lutData[i * 4 + 2] = (rgba32 >>> 8) & 0xff;
    // alpha (bits 0-7)
    lutData[i * 4 + 3] = (rgba32 >>> 0) & 0xff;
  }

  const lutTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
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

  // draw
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);

  const maskTexLoc = gl.getUniformLocation(program, "uMaskTex");
  const lutTexLoc = gl.getUniformLocation(program, "uLutTex");
  // texture unit 0
  gl.uniform1i(maskTexLoc, 0);
  // texture unit 1
  gl.uniform1i(lutTexLoc, 1);

  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // read back pixels
  const paintedPixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, paintedPixels);

  // cleanup
  gl.bindVertexArray(null);
  gl.useProgram(null);

  return paintedPixels;
};

// note: for POC only
export const getColorForCategoryTESTING = (cat: number) => {
  // example: 1=red, 2=green, 3=blue, else transparent
  if (cat === 1) return 0xff0000ff;
  if (cat === 2) return 0x00ff00ff;
  if (cat === 3) return 0x0000ffff;
  return 0x00000000;
};
