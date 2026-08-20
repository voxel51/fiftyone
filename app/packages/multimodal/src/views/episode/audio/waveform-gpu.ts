// ---------------------------------------------------------------------------
// WebGPU waveform rendering. One shared pipeline draws every visible
// track row from a full-row quad; the vertex shader maps each vertex's X
// to a time within [viewStart, viewEnd] and then to a peak-texture U (the
// exact inverse of TimelineTrack's `pct(t)`), and the fragment shader
// paints a vertical bar spanning [min, max] at that time. Per-row state
// (view window, row rect, color, texture binding) is pushed as a uniform
// per draw call — there is exactly one shader for every row, no
// permutations.
//
// No non-WebGPU fallback: the caller (WaveformViewer.tsx) is responsible
// for gating on `'gpu' in navigator` and rendering a text placeholder when
// absent — this module assumes a device is available.
// ---------------------------------------------------------------------------

import { chooseLod, type PeakPyramid } from "../../../audio/peak-pyramid";

const SHADER_SOURCE = /* wgsl */ `
struct RowUniforms {
  // x: viewStart (sec), y: viewEnd (sec), z: trackDurationSec, w: unused
  view: vec4<f32>,
  // x: rowTop, y: rowBottom (normalized device Y, -1..1),
  // z: display gain (see \`gainForPyramid\`), w: unused
  rowRect: vec4<f32>,
  color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> row: RowUniforms;
// rg32float is an "unfilterable-float" format in WebGPU (32-bit float
// textures aren't linearly filterable without the float32-filterable
// feature) — textureSample()+sampler would fail bind-group validation.
// textureLoad() reads an exact texel with no interpolation, which is
// also the semantically correct choice here: a peak texel already IS
// the min/max for its time bucket, so interpolating between neighbors
// would blur real peak values rather than reading them faithfully.
@group(0) @binding(1) var peakTexture: texture_2d<f32>;

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  // Full-row quad in NDC X (-1..1), row-bounded in NDC Y. The 6 vertices
  // pair each NDC X with a v (0 = row top, 1 = row bottom); u is derived
  // below from the SAME ndcX via the view window, not a fixed 0/1 texture
  // span — the texture covers the track's whole duration, but the quad
  // must sample only the visible [viewStart, viewEnd] slice of it.
  var ndcXs = array<f32, 6>(-1.0, 1.0, -1.0, -1.0, 1.0, 1.0);
  var vs = array<f32, 6>(0.0, 0.0, 1.0, 1.0, 0.0, 1.0);

  let ndcX = ndcXs[vertexIndex];
  let v = vs[vertexIndex];
  let ndcY = mix(row.rowRect.x, row.rowRect.y, v);

  let t = mix(row.view.x, row.view.y, (ndcX + 1.0) * 0.5);
  let u = t / max(row.view.z, 1e-6);

  var out: VertexOut;
  out.position = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
  out.uv = vec2<f32>(u, v);
  return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  // The bound texture already IS the chosen LOD level (one texture per
  // level, each its own natural width) — no row-select needed here.
  let dims = textureDimensions(peakTexture, 0);
  let x = clamp(i32(in.uv.x * f32(dims.x)), 0, i32(dims.x) - 1);
  let texel = textureLoad(peakTexture, vec2<i32>(x, 0), 0);
  let lo = texel.r;
  let hi = texel.g;

  // uv.y in [0,1] maps to the row's vertical span; the bar covers
  // [0.5 - hi/2, 0.5 - lo/2] (screen Y grows downward, sample amplitude
  // is centered at 0.5).
  // Display gain. Raw PCM rarely approaches full scale, so an unscaled
  // draw leaves a normal recording occupying a fraction of its row. The
  // gain normalizes the track to its own loudest peak; clamping after it
  // keeps an outlier transient from pushing the bar outside the row.
  let gain = max(row.rowRect.z, 1e-6);
  let centered = 0.5 - in.uv.y;
  let top = clamp(hi * gain, -1.0, 1.0) * 0.5;
  let bottom = clamp(lo * gain, -1.0, 1.0) * 0.5;

  // Analytic antialiasing: fade across one pixel of vertical distance
  // rather than the hard in/out test, which aliased badly on the near-
  // horizontal edges of quiet passages. fwidth() gives the per-pixel rate
  // of change of 'centered', so the feather is exactly one pixel wide at
  // any zoom or row height.
  let feather = max(fwidth(centered), 1e-6);
  let alpha =
    smoothstep(bottom - feather, bottom + feather, centered) *
    (1.0 - smoothstep(top - feather, top + feather, centered));

  // Amplitude ramp: a three-stop gradient from a deep base through the
  // row's own hue to a warm crest. Washing the peaks toward flat white
  // loses the hue exactly where the eye is drawn; running them warm keeps
  // loud passages legible and the two channels distinguishable at a
  // glance. The curve is intentionally weighted low — most content sits in
  // the bottom half of the range, so a linear ramp reads as monochrome.
  let amplitude = clamp(max(abs(top), abs(bottom)) * 2.0, 0.0, 1.0);
  let ramp = pow(amplitude, 0.65);
  let deep = row.color.rgb * 0.35;
  let crest = mix(row.color.rgb, vec3<f32>(1.0, 0.72, 0.35), 0.55);
  var rgb = mix(deep, row.color.rgb, clamp(ramp * 2.0, 0.0, 1.0));
  rgb = mix(rgb, crest, clamp(ramp * 2.0 - 1.0, 0.0, 1.0));

  // Zero-amplitude axis: the reference line that makes DC offset and
  // asymmetric clipping visible. Drawn as a subtle bright hairline, again
  // one pixel wide via fwidth().
  let axisHalfWidth = fwidth(centered) * 0.75;
  let axis = 1.0 - smoothstep(0.0, axisHalfWidth, abs(centered));
  rgb = mix(rgb, vec3<f32>(1.0, 1.0, 1.0), axis * 0.25);
  let axisAlpha = axis * 0.35;

  return vec4<f32>(rgb, row.color.a * max(alpha, axisAlpha));
}
`;

/** Leave a little room so a normalized peak never touches the row edge. */
const GAIN_HEADROOM = 0.92;
/**
 * Ceiling on the boost. Without it a near-silent track is amplified until
 * its noise floor looks like content.
 */
const MAX_GAIN = 8;
/** Below this peak a track is treated as silence and drawn unscaled. */
const SILENCE_FLOOR = 0.02;

// Keyed by pyramid identity: the coarsest level is small, but this runs per
// row per frame and the pyramid is stable for the life of a decoded track.
const peakCache = new WeakMap<PeakPyramid, number>();

/**
 * Loudest absolute sample in a track.
 *
 * Read off the COARSEST level, which is the cheapest array that still
 * summarizes the whole track — every level covers the full duration, so
 * the peak magnitude is the same at any LOD, and the top one is smallest.
 */
function peakForPyramid(pyramid: PeakPyramid): number {
  const cached = peakCache.get(pyramid);
  if (cached !== undefined) return cached;

  const level = pyramid.levels[pyramid.levels.length - 1];
  let peak = 0;
  if (level) {
    for (let i = 0; i < level.max.length; i++) {
      const hi = Math.abs(level.max[i]);
      if (hi > peak) peak = hi;
    }
    for (let i = 0; i < level.min.length; i++) {
      const lo = Math.abs(level.min[i]);
      if (lo > peak) peak = lo;
    }
  }

  peakCache.set(pyramid, peak);
  return peak;
}

/**
 * One display gain for every row drawn together.
 *
 * Deliberately shared rather than per-row: the rows of a render are the
 * channels of one source, and normalizing each to its own peak would draw
 * a quiet-left/loud-right recording as perfectly balanced — erasing the
 * stereo relationship the waveform exists to show.
 */
export function gainForRows(rows: readonly { pyramid: PeakPyramid }[]): number {
  let peak = 0;
  for (const row of rows) {
    const rowPeak = peakForPyramid(row.pyramid);
    if (rowPeak > peak) peak = rowPeak;
  }
  return peak < SILENCE_FLOOR ? 1 : Math.min(MAX_GAIN, GAIN_HEADROOM / peak);
}

export interface WaveformRowSpec {
  readonly trackId: string;
  readonly pyramid: PeakPyramid;
  /** This row's vertical span in the canvas, in CSS pixels. */
  readonly top: number;
  readonly height: number;
  readonly color: readonly [number, number, number, number];
}

export interface WaveformRenderArgs {
  readonly viewStart: number;
  readonly viewEnd: number;
  readonly canvas: HTMLCanvasElement;
  readonly rows: readonly WaveformRowSpec[];
}

/**
 * Owns the WebGPU device/pipeline and per-track peak textures. Call
 * `render(...)` on every view-state change (pan/zoom/new data) — it is not
 * a continuous RAF loop, since the timeline's own engine already drives
 * playhead motion and this renderer has nothing new to show between
 * pans/zooms/decodes.
 */
export class WaveformRenderer {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly context: GPUCanvasContext;
  // One texture PER LOD LEVEL per track — each level has its own natural
  // peak count, so giving each its own texture (rather than packing all
  // levels into shared-width rows) keeps `u` in [0,1] meaning "this
  // level's full duration" for every level, with no per-level width
  // bookkeeping in the shader. Rebuilt only when a track's pyramid
  // instance changes (peaks are computed once at decode time and cached
  // upstream).
  private readonly textureCache = new Map<
    string,
    { pyramid: PeakPyramid; textures: readonly (GPUTexture | null)[] }
  >();
  // One reusable uniform buffer per row slot. Every row's uniform block is
  // the same fixed size, and `render` runs on every pan/zoom/playhead
  // change — allocating a fresh buffer per row per frame (and never
  // destroying it) grew GPU memory for the lifetime of the tile.
  private readonly uniformBuffers: GPUBuffer[] = [];

  private uniformBufferFor(index: number, byteLength: number): GPUBuffer {
    const existing = this.uniformBuffers[index];
    if (existing) return existing;
    const buffer = this.device.createBuffer({
      size: byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.uniformBuffers[index] = buffer;
    return buffer;
  }

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
  ) {
    this.device = device;
    this.context = context;
    const module = device.createShaderModule({ code: SHADER_SOURCE });
    this.pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs_main" },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
              },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
  }

  static async create(canvas: HTMLCanvasElement): Promise<WaveformRenderer> {
    if (!("gpu" in navigator) || !navigator.gpu) {
      throw new Error("WebGPU is not available in this browser");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No WebGPU adapter available");
    }
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context) {
      throw new Error("Canvas does not support a webgpu context");
    }
    // The pipeline's target format must match whatever the context is
    // actually configured with — this varies by platform (commonly
    // "bgra8unorm" or "rgba8unorm") — so both come from the same call.
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "premultiplied" });
    return new WaveformRenderer(device, context, format);
  }

  private texturesFor(
    trackId: string,
    pyramid: PeakPyramid,
  ): readonly (GPUTexture | null)[] {
    const cached = this.textureCache.get(trackId);
    if (cached && cached.pyramid === pyramid) {
      return cached.textures;
    }
    // Destroy whatever this track had before: replacing the cache entry
    // without destroying leaks a full texture set per pyramid change.
    for (const texture of cached?.textures ?? []) {
      texture?.destroy();
    }

    // A 1-row texture is still bounded by `maxTextureDimension2D`, whose
    // guaranteed floor is 8192. LOD 0 holds one texel per `samplesPerPeak`
    // samples, so at 256 samples/peak and 48 kHz anything past ~44 seconds
    // overflows it and `createTexture` throws. Levels are each half the
    // width of the one before, so the fix is simply to not build the ones
    // that do not fit — `render` falls through to the first coarser level
    // that does. Every level spans the whole track, so the time->U mapping
    // is unaffected; a long track just starts at a coarser LOD.
    const maxWidth = this.device.limits.maxTextureDimension2D;

    // Each level's [min, max] pair goes in the R/G channels of a texel in
    // its own 1-row texture — see plan §6/§8 for why hardware mip
    // generation is unsuitable for min/max data (linear filtering would
    // incorrectly average min/max pairs across levels).
    const textures = pyramid.levels.map((level) => {
      const width = Math.max(1, level.min.length);
      if (width > maxWidth) return null;
      const data = new Float32Array(width * 2);
      for (let col = 0; col < level.min.length; col++) {
        data[col * 2] = level.min[col];
        data[col * 2 + 1] = level.max[col];
      }
      const texture = this.device.createTexture({
        size: { width, height: 1 },
        format: "rg32float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      this.device.queue.writeTexture(
        { texture },
        data,
        { bytesPerRow: width * 2 * 4, rowsPerImage: 1 },
        { width, height: 1 },
      );
      return texture;
    });
    this.textureCache.set(trackId, { pyramid, textures });
    return textures;
  }

  render(args: WaveformRenderArgs): void {
    if (args.canvas.width === 0 || args.canvas.height === 0) return;

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.pipeline);

    const canvasHeight = args.canvas.height;
    const viewDuration = args.viewEnd - args.viewStart;
    // One gain for the whole draw, so channels keep their relative levels.
    const displayGain = gainForRows(args.rows);
    for (const [rowIndex, row] of args.rows.entries()) {
      const textures = this.texturesFor(row.trackId, row.pyramid);

      // LOD 0's peak count * samplesPerPeak / sampleRate is the track's
      // total duration — every coarser level covers the same span with
      // fewer peaks, so this is level-independent.
      const lod0 = row.pyramid.levels[0];
      // A pyramid with no levels (empty/failed decode) has nothing to draw;
      // indexing it would throw inside the render loop.
      if (!lod0) continue;
      const trackDurationSec =
        (lod0.min.length * row.pyramid.samplesPerPeak) / row.pyramid.sampleRate;

      // Before the ruler establishes a view window (and on any degenerate
      // range) `viewEnd - viewStart` is 0, which makes the time->U mapping
      // divide by zero and paints nothing at all. Fall back to showing the
      // whole track so the waveform is visible immediately on mount.
      const hasViewWindow = viewDuration > 0;
      const rowViewStart = hasViewWindow ? args.viewStart : 0;
      const rowViewEnd = hasViewWindow ? args.viewEnd : trackDurationSec;

      const lod = chooseLod(row.pyramid, {
        viewDurationSec: rowViewEnd - rowViewStart,
        pixelWidth: args.canvas.width,
      });
      // Levels coarser than `lod` (higher index) are narrower, so if the
      // requested one was skipped for exceeding the texture-width limit the
      // next one along is the best available detail.
      let texture: GPUTexture | null = null;
      for (let level = lod; level < textures.length; level++) {
        const candidate = textures[level];
        if (candidate) {
          texture = candidate;
          break;
        }
      }
      if (!texture) continue;

      // NDC Y: canvas top is +1, bottom is -1.
      const topNdc = 1 - (2 * row.top) / canvasHeight;
      const bottomNdc = 1 - (2 * (row.top + row.height)) / canvasHeight;

      const uniformData = new Float32Array([
        rowViewStart,
        rowViewEnd,
        trackDurationSec,
        0,
        Math.min(topNdc, bottomNdc),
        Math.max(topNdc, bottomNdc),
        displayGain,
        0,
        ...row.color,
      ]);
      const uniformBuffer = this.uniformBufferFor(
        rowIndex,
        uniformData.byteLength,
      );
      this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      const bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: texture.createView() },
        ],
      });
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    for (const { textures } of this.textureCache.values()) {
      for (const texture of textures) texture?.destroy();
    }
    this.textureCache.clear();
    for (const buffer of this.uniformBuffers) buffer.destroy();
    this.uniformBuffers.length = 0;
  }
}
