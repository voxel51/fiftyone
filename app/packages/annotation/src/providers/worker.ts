import { getFetchFunction, setFetchFunction } from "@fiftyone/utilities";
import * as ort from "onnxruntime-web";
import type {
  DownloadProgress,
  InferenceResult,
  ProviderError,
  ProviderStatus,
  PromptPoint,
  WorkerMessageType,
  WorkerNotifications,
  WorkerResponse,
} from "./types";
import {
  SAM2_INPUT_SIZE,
  SAM2_OUTPUT_SIZE,
  transformPoint,
  computeMaskBbox,
  normalizeBbox,
  postprocessMask,
  type ImageGeometry,
  type ProcessedImage,
} from "./math";
import { loadModelWeights } from "./modelCache";
import { getEmbedding, putEmbedding } from "./embeddingCache";

// Typed helpers to enforce message shapes at compile time.

function postNotification<T extends keyof WorkerNotifications>(
  type: T,
  result: WorkerNotifications[T]
): void {
  self.postMessage({ type, result });
}

function postStatusNotification(status: ProviderStatus): void {
  postNotification("status", status);
}

function postProgressNotification(progress: DownloadProgress): void {
  postNotification("progress", progress);
}

function postWarningNotification(message: string): void {
  postNotification("warning", message);
}

function postErrorNotification(error: ProviderError): void {
  postNotification("error", error);
}

function postResponse<T extends WorkerMessageType>(
  id: number,
  type: T,
  result: WorkerResponse<T>,
  transfer?: Transferable[]
): void {
  self.postMessage({ id, type, success: true, result }, transfer as any);
}

function postError(id: number, type: string, error: string): void {
  self.postMessage({ id, type, success: false, error });
}

// ImageNet normalization (SAM2 trained on ImageNet-normalized images)
const IMAGE_MEAN = [0.485, 0.456, 0.406];
const IMAGE_STD = [0.229, 0.224, 0.225];

// Temporary perf instrumentation for the video-propagation tuning effort.
// Logs are tagged "[sam2-perf]" — filter the console on that. The encode vs.
// decode split is the key signal: encoder embeddings are prompt-independent
// and could be precomputed server-side; the decoder needs interactive points
// and must stay client-side. Flip to false (or strip this block) once the
// server-side-precompute decision is made.
const SAM2_PERF_LOG = true;

function perfLog(label: string, marks: Record<string, number>): void {
  if (!SAM2_PERF_LOG) return;
  const parts = Object.entries(marks)
    .map(([k, v]) => `${k}=${v.toFixed(1)}ms`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[sam2-perf] ${label} ${parts}`);
}

// SAM2 model family + Tiny variant file names
const FAMILY = "sam2";
const ENCODER_FILE = "encoder.with_runtime_opt.ort";
const DECODER_FILE = "decoder.onnx";

// Stable cache keys (independent of URL which may vary per deployment)
const ENCODER_CACHE_KEY = `${FAMILY}:${ENCODER_FILE}`;
const DECODER_CACHE_KEY = `${FAMILY}:${DECODER_FILE}`;

/**
 * Prefix embedding cache keys with the encoder contract so stale entries
 * are ignored if/when the model or preprocessing changes.
 */
const CACHE_PREFIX = `${ENCODER_CACHE_KEY}:${SAM2_INPUT_SIZE}:`;

/**
 * Resolve the download URL for a model weights file via the backend.
 *
 * Uses the shared fetch function so the path prefix configured by the main
 * thread is applied. Throws on non-2xx responses.
 */
async function resolveModelUrl(family: string, file: string): Promise<string> {
  const data = await getFetchFunction()<undefined, { url: string }>(
    "GET",
    `/runtime-assets/models/${family}/${file}`
  );
  return data.url;
}

const isCOI = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
ort.env.wasm.numThreads = isCOI ? navigator.hardwareConcurrency || 4 : 1;
ort.env.wasm.simd = true;

// WebGPU experiment: the SAM2 encoder is a heavy ViT and dominates per-frame
// time (~96%) under single-threaded WASM. Try the WebGPU execution provider
// when the runtime exposes it, falling back to WASM per-session if WebGPU
// can't load the model (the encoder ships as a runtime-optimized `.ort` file,
// which may be pinned to the WASM EP — `loadSession` reports the actual EP).
const WEBGPU_AVAILABLE =
  typeof navigator !== "undefined" &&
  !!(navigator as Navigator & { gpu?: unknown }).gpu;

if (SAM2_PERF_LOG) {
  // One-time execution-mode report. If crossOriginIsolated is false the WASM
  // backend is pinned to a single thread (see numThreads above) — usually the
  // dominant reason per-frame encode is slow. `webgpuAvailable` says whether
  // the GPU path will even be attempted; `loadSession` logs what each model
  // actually ran on.
  // eslint-disable-next-line no-console
  console.debug(
    `[sam2-perf] config crossOriginIsolated=${isCOI} ` +
      `numThreads=${ort.env.wasm.numThreads} simd=${ort.env.wasm.simd} ` +
      `hardwareConcurrency=${navigator.hardwareConcurrency} ` +
      `webgpuAvailable=${WEBGPU_AVAILABLE}`
  );
}

// Dev: optimizeDeps.exclude lets ort use its embedded WASM bundle.
// Prod: worker bundling strips the embedded WASM, so point to the emitted files.
if (!import.meta.env?.DEV && import.meta.env?.ORT_WASM_PATH) {
  ort.env.wasm.wasmPaths = import.meta.env.ORT_WASM_PATH;
}

let encoderSession: ort.InferenceSession | null = null;
let decoderSession: ort.InferenceSession | null = null;

// ── Video propagation sessions (loaded lazily via loadVideoModel) ──────────
const VIDEO_DECODER_FILE = "image_decoder_video.onnx";
const MEMORY_ENCODER_FILE = "memory_encoder.onnx";
const MEMORY_ATTENTION_FILE = "memory_attention_hiera_t.onnx";
const NO_MEM_EMBED_FILE = "no_mem_embed.bin";
const VISION_POS_EMBED_FILE = "vision_pos_embed.bin";

let videoDecoderSession: ort.InferenceSession | null = null;
let memoryEncoderSession: ort.InferenceSession | null = null;
let memoryAttentionSession: ort.InferenceSession | null = null;
let noMemEmbed: Float32Array | null = null; // [256] — no_mem_embed constant
let visionPosEmbed: Float32Array | null = null; // [4096 * 256] — spatial pos enc
let maskmemTposEnc: Float32Array | null = null; // [7 * 64] — temporal pos enc

// SAM2 hiera-tiny spatial constants
const VIS_C = 256;
const MEM_C = 64;
const FEAT_SPATIAL = 64;
const FEAT_HW = FEAT_SPATIAL * FEAT_SPATIAL; // 4096
const MAX_MEMORY = 6;
const VIDEO_MASK_SZ = 1024;

interface MemorySlot {
  features: Float32Array; // [FEAT_HW * MEM_C] — seq-first [HW, C] layout
  posEnc: Float32Array; // [FEAT_HW * MEM_C] — without tpos added
}

interface VideoSession {
  bank: MemorySlot[]; // newest-first
  origW: number;
  origH: number;
}

const videoSessions = new Map<string, VideoSession>();

/** [1, C, H, W] BCHW → [H*W, 1, C] seq-first (for memory_attention inputs). */
function bchwToSeqFirst(src: Float32Array, C: number): Float32Array {
  const HW = src.length / C;
  const dst = new Float32Array(HW * C);
  for (let hw = 0; hw < HW; hw++)
    for (let c = 0; c < C; c++) dst[hw * C + c] = src[c * HW + hw];
  return dst;
}

/** [H*W, 1, C] seq-first → [1, C, H*W] BCHW (inverse of bchwToSeqFirst). */
function seqFirstToBchw(src: Float32Array, C: number): Float32Array {
  const HW = src.length / C;
  const dst = new Float32Array(HW * C);
  for (let hw = 0; hw < HW; hw++)
    for (let c = 0; c < C; c++) dst[c * HW + hw] = src[hw * C + c];
  return dst;
}

/** Build an InferenceResult from the [VIDEO_MASK_SZ × VIDEO_MASK_SZ] logit mask. */
function maskLogitsToResult(mask: Float32Array): InferenceResult {
  const SZ = VIDEO_MASK_SZ;
  let mx0 = SZ,
    my0 = SZ,
    mx1 = -1,
    my1 = -1;
  for (let y = 0; y < SZ; y++) {
    for (let x = 0; x < SZ; x++) {
      if (mask[y * SZ + x] > 0) {
        if (x < mx0) mx0 = x;
        if (x > mx1) mx1 = x;
        if (y < my0) my0 = y;
        if (y > my1) my1 = y;
      }
    }
  }
  if (mx1 < 0) throw new Error("Video decoder returned an empty mask");

  const cropW = mx1 - mx0 + 1;
  const cropH = my1 - my0 + 1;
  const croppedMask = new Float32Array(cropW * cropH);
  for (let y = 0; y < cropH; y++)
    for (let x = 0; x < cropW; x++) {
      const logit = mask[(my0 + y) * SZ + (mx0 + x)];
      croppedMask[y * cropW + x] = 1 / (1 + Math.exp(-logit));
    }

  return {
    mask: croppedMask,
    maskWidth: cropW,
    maskHeight: cropH,
    bbox: { x: mx0 / SZ, y: my0 / SZ, w: cropW / SZ, h: cropH / SZ },
  };
}

async function loadVideoModel(): Promise<void> {
  // Try WebGPU (Metal on Mac, Vulkan/D3D12 on Windows/Linux) then fall back
  // to WASM. CUDA is not available in-browser — WebGPU is the GPU path here.
  // memory_attention has dynamic batch axes; ORT Web WebGPU may reject it and
  // we want a clean WASM fallback rather than a hard failure.
  // TODO: get webgpu to work at parity — fp16 quantisation and possible
  // op-level fallbacks cause visible mask shrinkage vs WASM fp32 baseline.
  const videoEpCandidates: ort.InferenceSession.SessionOptions["executionProviders"][] =
    [["wasm"]];

  async function loadOrtSession(
    file: string,
    cacheKey: string
  ): Promise<ort.InferenceSession> {
    const url = await resolveModelUrl(FAMILY, file);
    const buf = await loadModelWeights(
      url,
      cacheKey,
      () => {},
      postWarningNotification
    );
    let lastErr: unknown;
    for (const executionProviders of videoEpCandidates) {
      try {
        const session = await ort.InferenceSession.create(buf, {
          executionProviders,
        });
        if (SAM2_PERF_LOG) {
          // eslint-disable-next-line no-console
          console.debug(
            `[sam2-perf] video-session ${file} ep=${
              (executionProviders as string[])[0]
            }`
          );
        }
        return session;
      } catch (err) {
        lastErr = err;
        if (SAM2_PERF_LOG) {
          // eslint-disable-next-line no-console
          console.debug(
            `[sam2-perf] video-session ${file} ep=${
              (executionProviders as string[])[0]
            } FAILED, trying next: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }
    throw lastErr;
  }

  const [vd, me, ma] = await Promise.all([
    videoDecoderSession
      ? Promise.resolve(videoDecoderSession)
      : loadOrtSession(VIDEO_DECODER_FILE, `${FAMILY}:${VIDEO_DECODER_FILE}`),
    memoryEncoderSession
      ? Promise.resolve(memoryEncoderSession)
      : loadOrtSession(MEMORY_ENCODER_FILE, `${FAMILY}:${MEMORY_ENCODER_FILE}`),
    memoryAttentionSession
      ? Promise.resolve(memoryAttentionSession)
      : loadOrtSession(
          MEMORY_ATTENTION_FILE,
          `${FAMILY}:${MEMORY_ATTENTION_FILE}`
        ),
  ]);
  videoDecoderSession = vd;
  memoryEncoderSession = me;
  memoryAttentionSession = ma;

  if (!noMemEmbed) {
    const url = await resolveModelUrl(FAMILY, NO_MEM_EMBED_FILE);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch ${NO_MEM_EMBED_FILE}`);
    noMemEmbed = new Float32Array(await resp.arrayBuffer()); // [256]
  }
  if (!visionPosEmbed) {
    const url = await resolveModelUrl(FAMILY, VISION_POS_EMBED_FILE);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch ${VISION_POS_EMBED_FILE}`);
    visionPosEmbed = new Float32Array(await resp.arrayBuffer()); // [4096*256]
  }
}

async function initVideoSession(
  sessionId: string,
  bitmap: ImageBitmap,
  points: PromptPoint[]
): Promise<void> {
  if (!encoderSession || !videoDecoderSession || !memoryEncoderSession)
    throw new Error("Video models not loaded — call loadVideoModel first");

  const imageData = bitmapToImageData(bitmap);
  const processed = preprocessImage(imageData);
  const { originalWidth: origW, originalHeight: origH } = processed;

  // Encode
  const encOut = await encoderSession.run({
    image: new ort.Tensor("float32", processed.tensor, [
      1,
      3,
      SAM2_INPUT_SIZE,
      SAM2_INPUT_SIZE,
    ]),
  });
  const hr0Dims = [...encOut["high_res_feats_0"].dims];
  const hr1Dims = [...encOut["high_res_feats_1"].dims];
  const imageEmbed = (await encOut["image_embed"].getData(
    true
  )) as Float32Array;
  const hr0 = (await encOut["high_res_feats_0"].getData(true)) as Float32Array;
  const hr1 = (await encOut["high_res_feats_1"].getData(true)) as Float32Array;

  // Decode seed frame with user points
  const n = points.length;
  const coords = new Float32Array(n * 2);
  const labels = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [sx, sy] = transformPoint(points[i].x, points[i].y);
    coords[i * 2] = sx;
    coords[i * 2 + 1] = sy;
    labels[i] = points[i].label;
  }
  const decOut = await videoDecoderSession.run({
    point_coords: new ort.Tensor("float32", coords, [1, n, 2]),
    point_labels: new ort.Tensor("float32", labels, [1, n]),
    image_embed: new ort.Tensor("float32", imageEmbed, [
      1,
      VIS_C,
      FEAT_SPATIAL,
      FEAT_SPATIAL,
    ]),
    high_res_feats_0: new ort.Tensor("float32", hr0, hr0Dims),
    high_res_feats_1: new ort.Tensor("float32", hr1, hr1Dims),
  });
  const highResMasks = decOut["high_res_masks"].data as Float32Array;

  // Memory encode the seed frame
  const memOut = await memoryEncoderSession.run({
    pix_feat: new ort.Tensor("float32", imageEmbed, [
      1,
      VIS_C,
      FEAT_SPATIAL,
      FEAT_SPATIAL,
    ]),
    pred_masks_high_res: new ort.Tensor("float32", highResMasks, [
      1,
      1,
      VIDEO_MASK_SZ,
      VIDEO_MASK_SZ,
    ]),
  });

  if (!maskmemTposEnc) {
    maskmemTposEnc = new Float32Array(
      memOut["maskmem_tpos_enc"].data as Float32Array
    ); // [7 * 64]
  }

  videoSessions.set(sessionId, {
    bank: [
      {
        features: bchwToSeqFirst(
          memOut["maskmem_features"].data as Float32Array,
          MEM_C
        ),
        posEnc: bchwToSeqFirst(
          memOut["maskmem_pos_enc"].data as Float32Array,
          MEM_C
        ),
      },
    ],
    origW,
    origH,
  });
}

async function propagateVideoFrame(
  sessionId: string,
  bitmap: ImageBitmap
): Promise<InferenceResult> {
  const session = videoSessions.get(sessionId);
  if (!session) throw new Error(`No video session: ${sessionId}`);
  if (
    !encoderSession ||
    !videoDecoderSession ||
    !memoryEncoderSession ||
    !memoryAttentionSession ||
    !noMemEmbed ||
    !visionPosEmbed ||
    !maskmemTposEnc
  )
    throw new Error("Video models not loaded");

  const t0 = performance.now();
  const processed = preprocessImage(bitmapToImageData(bitmap));

  // Encode
  const tEnc = performance.now();
  const encOut = await encoderSession.run({
    image: new ort.Tensor("float32", processed.tensor, [
      1,
      3,
      SAM2_INPUT_SIZE,
      SAM2_INPUT_SIZE,
    ]),
  });
  const hr0Dims = [...encOut["high_res_feats_0"].dims];
  const hr1Dims = [...encOut["high_res_feats_1"].dims];
  const imageEmbed = (await encOut["image_embed"].getData(
    true
  )) as Float32Array;
  const hr0 = (await encOut["high_res_feats_0"].getData(true)) as Float32Array;
  const hr1 = (await encOut["high_res_feats_1"].getData(true)) as Float32Array;
  const encMs = performance.now() - tEnc;

  // Raw vision features: bchwToSeqFirst(imageEmbed) minus noMemEmbed
  const rawFeats = bchwToSeqFirst(imageEmbed, VIS_C);
  for (let hw = 0; hw < FEAT_HW; hw++)
    for (let c = 0; c < VIS_C; c++) rawFeats[hw * VIS_C + c] -= noMemEmbed[c];

  // Build memory bank tensors (bank[0] = most recent = t_pos 0)
  const nMem = session.bank.length;
  const memory = new Float32Array(nMem * FEAT_HW * MEM_C);
  const memPos = new Float32Array(nMem * FEAT_HW * MEM_C);
  for (let i = 0; i < nMem; i++) {
    const slot = session.bank[i];
    memory.set(slot.features, i * FEAT_HW * MEM_C);
    const tposOff = i * MEM_C;
    const posWithTpos = new Float32Array(FEAT_HW * MEM_C);
    for (let hw = 0; hw < FEAT_HW; hw++)
      for (let c = 0; c < MEM_C; c++)
        posWithTpos[hw * MEM_C + c] =
          slot.posEnc[hw * MEM_C + c] + maskmemTposEnc[tposOff + c];
    memPos.set(posWithTpos, i * FEAT_HW * MEM_C);
  }

  // Memory attention
  const tMa = performance.now();
  const maOut = await memoryAttentionSession.run({
    curr: new ort.Tensor("float32", rawFeats, [FEAT_HW, 1, VIS_C]),
    memory: new ort.Tensor("float32", memory, [nMem * FEAT_HW, 1, MEM_C]),
    curr_pos: new ort.Tensor("float32", visionPosEmbed, [FEAT_HW, 1, VIS_C]),
    memory_pos: new ort.Tensor("float32", memPos, [nMem * FEAT_HW, 1, MEM_C]),
    num_obj_ptr_tokens: new ort.Tensor("int64", new BigInt64Array([0n]), []),
  });
  const condEmbed = seqFirstToBchw(
    maOut["pix_feat"].data as Float32Array,
    VIS_C
  );
  const maMs = performance.now() - tMa;

  // Decode with no-click padding point (-1, -1) / label -1
  const tDec = performance.now();
  const decOut = await videoDecoderSession.run({
    point_coords: new ort.Tensor(
      "float32",
      new Float32Array([-1, -1]),
      [1, 1, 2]
    ),
    point_labels: new ort.Tensor("float32", new Float32Array([-1]), [1, 1]),
    image_embed: new ort.Tensor("float32", condEmbed, [
      1,
      VIS_C,
      FEAT_SPATIAL,
      FEAT_SPATIAL,
    ]),
    high_res_feats_0: new ort.Tensor("float32", hr0, hr0Dims),
    high_res_feats_1: new ort.Tensor("float32", hr1, hr1Dims),
  });
  const highResMasks = decOut["high_res_masks"].data as Float32Array;
  const decMs = performance.now() - tDec;

  // Memory encode conditioned features for next frame
  const tMe = performance.now();
  const memOut = await memoryEncoderSession.run({
    pix_feat: new ort.Tensor("float32", condEmbed, [
      1,
      VIS_C,
      FEAT_SPATIAL,
      FEAT_SPATIAL,
    ]),
    pred_masks_high_res: new ort.Tensor("float32", highResMasks, [
      1,
      1,
      VIDEO_MASK_SZ,
      VIDEO_MASK_SZ,
    ]),
  });
  const meMs = performance.now() - tMe;

  // Update sliding window (newest first, max MAX_MEMORY slots)
  session.bank.unshift({
    features: bchwToSeqFirst(
      memOut["maskmem_features"].data as Float32Array,
      MEM_C
    ),
    posEnc: bchwToSeqFirst(
      memOut["maskmem_pos_enc"].data as Float32Array,
      MEM_C
    ),
  });
  if (session.bank.length > MAX_MEMORY) session.bank.pop();

  const result = maskLogitsToResult(
    highResMasks.subarray(0, VIDEO_MASK_SZ * VIDEO_MASK_SZ)
  );

  perfLog("video-propagate", {
    total: performance.now() - t0,
    enc: encMs,
    memAttn: maMs,
    dec: decMs,
    memEnc: meMs,
  });

  return result;
}

function endVideoSession(sessionId: string): void {
  videoSessions.delete(sessionId);
}

/**
 * Fetch an image URL and decode it into ImageData.
 *
 * @param url Image source URL
 */
async function loadImageData(url: string): Promise<ImageData> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (e) {
    throw new Error(`Image fetch failed (check CORS headers): ${e}`);
  }
  if (!response.ok)
    throw new Error(
      `Image fetch failed: ${response.status} ${response.statusText}`
    );

  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob).catch((e) => {
    throw new Error(`Failed to decode image: ${e}`);
  });

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2d context");

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Scale and pad the image to SAM2_INPUT_SIZE x SAM2_INPUT_SIZE, then extract
 * a normalized float tensor.
 *
 * @param imageData Raw RGBA pixel data from the source image
 * @returns Preprocessing metadata and the normalized tensor for the encoder
 */
function preprocessImage(imageData: ImageData): ProcessedImage {
  const { width, height } = imageData;

  // SAM2 reference preprocessing is a direct (non-aspect-preserving) resize
  // to 1024x1024. No padding; just stretch the image to fill the input.
  const canvas = new OffscreenCanvas(SAM2_INPUT_SIZE, SAM2_INPUT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2d context");

  const tmp = new OffscreenCanvas(width, height);
  const tmpCtx = tmp.getContext("2d");
  if (!tmpCtx) throw new Error("Failed to get 2d context");
  tmpCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(tmp, 0, 0, SAM2_INPUT_SIZE, SAM2_INPUT_SIZE);

  const pixels = ctx.getImageData(0, 0, SAM2_INPUT_SIZE, SAM2_INPUT_SIZE).data;
  const N = SAM2_INPUT_SIZE * SAM2_INPUT_SIZE;
  const tensor = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    const j = i * 4;
    tensor[i] = (pixels[j] / 255 - IMAGE_MEAN[0]) / IMAGE_STD[0];
    tensor[i + N] = (pixels[j + 1] / 255 - IMAGE_MEAN[1]) / IMAGE_STD[1];
    tensor[i + 2 * N] = (pixels[j + 2] / 255 - IMAGE_MEAN[2]) / IMAGE_STD[2];
  }

  return { tensor, originalWidth: width, originalHeight: height };
}

/**
 * Download (or load from IndexedDB cache) and initialize the ONNX sessions.
 * Posts progress and warning notifications back to the main thread during download.
 */
async function loadModel(): Promise<void> {
  // Prefer WebGPU when available, but fall back to WASM per-session: the
  // runtime-optimized `.ort` encoder may refuse the GPU EP, while the plain
  // `.onnx` decoder is portable. Ordering an EP list as ["webgpu", "wasm"]
  // does NOT fall back if model load fails on the first EP, so we try them
  // as separate create() attempts and report which one stuck.
  const epCandidates: ort.InferenceSession.SessionOptions["executionProviders"][] =
    WEBGPU_AVAILABLE ? [["webgpu"], ["wasm"]] : [["wasm"]];

  async function loadSession(
    family: string,
    file: string,
    cacheKey: string,
    name: "encoder" | "decoder",
    failureKind: "encoder_failure" | "decoder_failure"
  ): Promise<ort.InferenceSession> {
    let buf: ArrayBuffer;
    try {
      const url = await resolveModelUrl(family, file);
      buf = await loadModelWeights(
        url,
        cacheKey,
        (loaded, total) =>
          postProgressNotification({ file: name, loaded, total }),
        postWarningNotification
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      postErrorNotification({
        kind: "download_failure",
        message: `${name} download failed: ${msg}`,
      });
      throw err;
    }

    let lastErr: unknown;
    for (const executionProviders of epCandidates) {
      try {
        const onWebGpu = (executionProviders as string[])[0] === "webgpu";
        const sessionOptions: ort.InferenceSession.SessionOptions = {
          executionProviders,
        };
        // Keep the encoder's large embedding outputs resident on the GPU so
        // the decoder can read them in place — avoids a ~16MB GPU→CPU readback
        // per frame, which `run()` would otherwise bundle into encode time.
        // Only meaningful on WebGPU; the cache-store path downloads explicitly
        // via getData() when it needs CPU copies.
        if (onWebGpu && name === "encoder") {
          sessionOptions.preferredOutputLocation = {
            image_embed: "gpu-buffer",
            high_res_feats_0: "gpu-buffer",
            high_res_feats_1: "gpu-buffer",
          };
        }
        const session = await ort.InferenceSession.create(buf, sessionOptions);
        if (SAM2_PERF_LOG) {
          // eslint-disable-next-line no-console
          console.debug(
            `[sam2-perf] session ${name} ep=${
              (executionProviders as string[])[0]
            }`
          );
        }
        return session;
      } catch (err) {
        lastErr = err;
        if (SAM2_PERF_LOG) {
          // eslint-disable-next-line no-console
          console.debug(
            `[sam2-perf] session ${name} ep=${
              (executionProviders as string[])[0]
            } FAILED, trying next: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }

    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    postErrorNotification({
      kind: failureKind,
      message: `${name} init failed (all EPs): ${msg}`,
    });
    throw lastErr;
  }

  if (!encoderSession)
    encoderSession = await loadSession(
      FAMILY,
      ENCODER_FILE,
      ENCODER_CACHE_KEY,
      "encoder",
      "encoder_failure"
    );

  if (!decoderSession)
    decoderSession = await loadSession(
      FAMILY,
      DECODER_FILE,
      DECODER_CACHE_KEY,
      "decoder",
      "decoder_failure"
    );

  if (WEBGPU_AVAILABLE) await prewarmSessions();
}

/**
 * Run one throwaway encode+decode on a zero image so WebGPU compiles its
 * compute pipelines at load time rather than on the user's first frame
 * (observed ~2.2s cold-start vs ~0.45s steady-state). Best-effort: a warmup
 * failure is logged but never blocks model init.
 */
async function prewarmSessions(): Promise<void> {
  if (!encoderSession || !decoderSession) return;
  const t0 = performance.now();
  try {
    const enc = await encoderSession.run({
      image: new ort.Tensor(
        "float32",
        new Float32Array(3 * SAM2_INPUT_SIZE * SAM2_INPUT_SIZE),
        [1, 3, SAM2_INPUT_SIZE, SAM2_INPUT_SIZE]
      ),
    });
    await decoderSession.run({
      image_embed: enc["image_embed"],
      high_res_feats_0: enc["high_res_feats_0"],
      high_res_feats_1: enc["high_res_feats_1"],
      point_coords: new ort.Tensor(
        "float32",
        new Float32Array([0, 0]),
        [1, 1, 2]
      ),
      point_labels: new ort.Tensor("float32", new Float32Array([1]), [1, 1]),
      mask_input: new ort.Tensor(
        "float32",
        new Float32Array(SAM2_OUTPUT_SIZE * SAM2_OUTPUT_SIZE),
        [1, 1, SAM2_OUTPUT_SIZE, SAM2_OUTPUT_SIZE]
      ),
      has_mask_input: new ort.Tensor("float32", new Float32Array([0]), [1]),
    });
    perfLog("prewarm", { ms: performance.now() - t0 });
  } catch (err) {
    postWarningNotification(
      `Prewarm failed (non-fatal): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

/**
 * Convert an already-decoded ImageBitmap to ImageData via OffscreenCanvas.
 * Used for video frames that arrive over postMessage rather than by URL.
 */
function bitmapToImageData(bitmap: ImageBitmap): ImageData {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2d context");
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Run the full SAM2 pipeline: preprocess, encode, decode, and postprocess.
 *
 * @param imageUrl Image source URL
 * @param points Prompt points in normalized [0,1] coordinates
 * @returns The best mask (selected by IoU) in original image dimensions
 */
async function embedAndDecode(
  imageUrl: string,
  points: PromptPoint[]
): Promise<InferenceResult> {
  const imageData = await loadImageData(imageUrl);
  return embedAndDecodeFromImageData(
    imageData,
    CACHE_PREFIX + imageUrl,
    points
  );
}

/**
 * SAM2 against an already-decoded frame bitmap. Mirrors {@link embedAndDecode}
 * but keys the embedding cache on the caller-supplied `cacheKey` instead of a
 * URL. Used by video propagation (see `videoPropagation.ts`).
 */
async function embedAndDecodeBitmap(
  bitmap: ImageBitmap,
  cacheKey: string,
  points: PromptPoint[]
): Promise<InferenceResult> {
  const tDecodeBitmap = performance.now();
  const imageData = bitmapToImageData(bitmap);
  perfLog("bitmapToImageData", {
    ms: performance.now() - tDecodeBitmap,
    px: bitmap.width * bitmap.height,
  });
  // Propagation runs the GPU-resident path: each frame's embedding is used
  // exactly once (encode → decode same frame), so we skip the embedding cache
  // entirely. That keeps the encoder outputs on the GPU (no per-frame readback)
  // and avoids ~16MB/frame of pointless IndexedDB writes. Trade-off: re-running
  // propagation over the same frames re-encodes instead of hitting the cache.
  return embedAndDecodeFromImageData(
    imageData,
    CACHE_PREFIX + cacheKey,
    points,
    /* useEmbeddingCache */ false
  );
}

/**
 * Encode-only path used to pre-encode upcoming frames. Runs the image
 * encoder and writes the embedding to the per-frame cache; no decoder work,
 * no result beyond void. A later {@link embedAndDecodeBitmap} with the same
 * `cacheKey` then hits the cache and runs the decoder only.
 */
async function encodeBitmap(
  bitmap: ImageBitmap,
  cacheKey: string
): Promise<void> {
  if (!encoderSession) throw new Error("Model not loaded");

  const fullKey = CACHE_PREFIX + cacheKey;

  // Skip if already encoded (mem-LRU or IDB).
  const cached = await getEmbedding(fullKey, postWarningNotification);
  if (cached) return;

  const imageData = bitmapToImageData(bitmap);
  const processed = preprocessImage(imageData);

  const encResults = await encoderSession.run({
    image: new ort.Tensor("float32", processed.tensor, [
      1,
      3,
      SAM2_INPUT_SIZE,
      SAM2_INPUT_SIZE,
    ]),
  });

  // Capture dims before getData(true) releases the GPU buffer.
  const imageEmbedDims = [...encResults["image_embed"].dims];
  const highResFeats0Dims = [...encResults["high_res_feats_0"].dims];
  const highResFeats1Dims = [...encResults["high_res_feats_1"].dims];

  // getData downloads gpu-buffer outputs (no-op for cpu tensors); release=true
  // frees the GPU buffer since this encode-only path has no decoder to feed.
  const [imageEmbed, highResFeats0, highResFeats1] = (await Promise.all([
    encResults["image_embed"].getData(true),
    encResults["high_res_feats_0"].getData(true),
    encResults["high_res_feats_1"].getData(true),
  ])) as Float32Array[];

  await putEmbedding(
    fullKey,
    {
      imageEmbed: {
        data: imageEmbed,
        dims: imageEmbedDims,
      },
      highResFeats0: {
        data: highResFeats0,
        dims: highResFeats0Dims,
      },
      highResFeats1: {
        data: highResFeats1,
        dims: highResFeats1Dims,
      },
      processedImage: {
        originalWidth: processed.originalWidth,
        originalHeight: processed.originalHeight,
      },
    },
    postWarningNotification
  );
}

/**
 * Shared SAM2 core: encode (or reuse a cached embedding for `cacheKey`),
 * decode against `points`, and postprocess to the best mask. `cacheKey` is
 * the fully-qualified embedding-cache key (already `CACHE_PREFIX`-prefixed).
 */
async function embedAndDecodeFromImageData(
  imageData: ImageData,
  cacheKey: string,
  points: PromptPoint[],
  useEmbeddingCache = true
): Promise<InferenceResult> {
  if (!encoderSession || !decoderSession) throw new Error("Model not loaded");

  if (points.length === 0)
    throw new Error("At least one prompt point is required");

  const tStart = performance.now();
  let preprocessMs = 0;
  let encodeMs = 0;
  let cacheLookupMs = 0;

  let encResults: Record<string, ort.Tensor>;
  let geometry: ImageGeometry;
  let cacheHit = false;

  // Encoder outputs may be GPU-resident (preferredOutputLocation). Those must
  // be released after the decoder reads them; collect them for a finally.
  const gpuTensors: ort.Tensor[] = [];

  if (useEmbeddingCache) {
    const tCache = performance.now();
    const cached = await getEmbedding(cacheKey, postWarningNotification);
    cacheLookupMs = performance.now() - tCache;

    if (cached) {
      try {
        encResults = {
          image_embed: new ort.Tensor(
            "float32",
            cached.imageEmbed.data,
            cached.imageEmbed.dims
          ),
          high_res_feats_0: new ort.Tensor(
            "float32",
            cached.highResFeats0.data,
            cached.highResFeats0.dims
          ),
          high_res_feats_1: new ort.Tensor(
            "float32",
            cached.highResFeats1.data,
            cached.highResFeats1.dims
          ),
        };
        geometry = cached.processedImage;
        cacheHit = true;
      } catch {
        postWarningNotification("Corrupt embedding cache entry, re-encoding");
      }
    }
  }

  try {
    if (!cacheHit) {
      postStatusNotification("encoding");
      const tPreprocess = performance.now();
      const processed = preprocessImage(imageData);
      geometry = processed;
      preprocessMs = performance.now() - tPreprocess;

      const tEncode = performance.now();
      encResults = await encoderSession.run({
        image: new ort.Tensor("float32", processed.tensor, [
          1,
          3,
          SAM2_INPUT_SIZE,
          SAM2_INPUT_SIZE,
        ]),
      });
      // With GPU-resident outputs, run() resolves without downloading the
      // ~16MB of embeddings — so this is now encode COMPUTE, not compute+readback.
      encodeMs = performance.now() - tEncode;

      const encoderOutputs = [
        encResults["image_embed"],
        encResults["high_res_feats_0"],
        encResults["high_res_feats_1"],
      ];
      for (const t of encoderOutputs) {
        if (t.location !== "cpu") gpuTensors.push(t);
      }

      // Embedding payload size (element counts via dims — works whether the
      // tensor is on CPU or GPU). The deciding factor for a server-side
      // precompute that would ship these instead of encoding client-side.
      const elems = (t: ort.Tensor) => t.dims.reduce((a, b) => a * b, 1);
      perfLog("embedding-size", {
        mb:
          (elems(encResults["image_embed"]) +
            elems(encResults["high_res_feats_0"]) +
            elems(encResults["high_res_feats_1"])) *
          (Float32Array.BYTES_PER_ELEMENT / (1024 * 1024)),
        imageEmbed: elems(encResults["image_embed"]),
        highRes0: elems(encResults["high_res_feats_0"]),
        highRes1: elems(encResults["high_res_feats_1"]),
      });

      if (useEmbeddingCache) {
        // Caching needs CPU copies, so download explicitly here (getData on a
        // gpu-buffer tensor reads it back; on a cpu tensor it returns .data).
        // releaseData=false keeps the buffer alive for the decoder below.
        const [imageEmbed, highResFeats0, highResFeats1] = (await Promise.all([
          encResults["image_embed"].getData(false),
          encResults["high_res_feats_0"].getData(false),
          encResults["high_res_feats_1"].getData(false),
        ])) as Float32Array[];

        // Fire-and-forget: IDB write runs in background while decoder proceeds.
        putEmbedding(
          cacheKey,
          {
            // Key names are defined by the ONNX model and must match exactly.
            // Encode — input: "image"; outputs: "image_embed", "high_res_feats_0", "high_res_feats_1"
            imageEmbed: {
              data: imageEmbed,
              dims: [...encResults["image_embed"].dims],
            },
            highResFeats0: {
              data: highResFeats0,
              dims: [...encResults["high_res_feats_0"].dims],
            },
            highResFeats1: {
              data: highResFeats1,
              dims: [...encResults["high_res_feats_1"].dims],
            },
            processedImage: {
              originalWidth: geometry.originalWidth,
              originalHeight: geometry.originalHeight,
            },
          },
          postWarningNotification
        );
      }
    }

    // Build decoder inputs
    const n = points.length;
    const coords = new Float32Array(n * 2);
    const labels = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [sx, sy] = transformPoint(points[i].x, points[i].y);
      coords[i * 2] = sx;
      coords[i * 2 + 1] = sy;
      labels[i] = points[i].label;
    }

    // Decode — outputs: "masks", "iou_predictions". The encoder embeddings may
    // be GPU-resident here; the decoder reads them in place (same WebGPU device).
    const tDecode = performance.now();
    const decResults = await decoderSession.run({
      image_embed: encResults["image_embed"],
      high_res_feats_0: encResults["high_res_feats_0"],
      high_res_feats_1: encResults["high_res_feats_1"],
      point_coords: new ort.Tensor("float32", coords, [1, n, 2]),
      point_labels: new ort.Tensor("float32", labels, [1, n]),
      mask_input: new ort.Tensor(
        "float32",
        new Float32Array(SAM2_OUTPUT_SIZE * SAM2_OUTPUT_SIZE),
        [1, 1, SAM2_OUTPUT_SIZE, SAM2_OUTPUT_SIZE]
      ),
      has_mask_input: new ort.Tensor("float32", new Float32Array([0]), [1]),
    });
    const decodeMs = performance.now() - tDecode;

    const tPost = performance.now();

    // Pick best mask by IoU (Intersection over Union) confidence score
    const masks = decResults["masks"].data as Float32Array;
    const ious = decResults["iou_predictions"].data as Float32Array;
    const sz = SAM2_OUTPUT_SIZE * SAM2_OUTPUT_SIZE;

    let bestIdx = 0;
    for (let i = 1; i < ious.length; i++) {
      if (ious[i] > ious[bestIdx]) bestIdx = i;
    }

    const bestMask = masks.slice(bestIdx * sz, (bestIdx + 1) * sz);
    const bbox = computeMaskBbox(bestMask, geometry);

    if (!bbox) throw new Error("Model returned an empty mask");

    const finalMask = postprocessMask(bestMask, geometry, bbox);
    const postMs = performance.now() - tPost;

    perfLog(cacheHit ? "infer(cache-hit)" : "infer(cache-miss)", {
      total: performance.now() - tStart,
      cacheLookup: cacheLookupMs,
      preprocess: preprocessMs,
      encode: encodeMs,
      decode: decodeMs,
      post: postMs,
    });

    return {
      mask: finalMask,
      maskWidth: bbox.w,
      maskHeight: bbox.h,
      bbox: normalizeBbox(bbox, geometry),
    };
  } finally {
    // Release GPU-resident encoder outputs (no-op for cached/CPU tensors).
    for (const t of gpuTensors) t.dispose();
  }
}

// Worker message handler
self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;

  try {
    if (type === "init") {
      // Mirror main-thread fetch params (origin, headers, pathPrefix) so
      // getFetchFunction() routes through the right backend path.
      const { origin, headers, pathPrefix } = payload;
      setFetchFunction(origin, headers, pathPrefix);
      return;
    }
    if (type === "loadModel") {
      await loadModel();
      postResponse(id, "loadModel", undefined as void);
    } else if (type === "embedAndDecode") {
      const result = await embedAndDecode(payload.imageUrl, payload.points);
      postStatusNotification("ready");
      postResponse(id, "embedAndDecode", result, [
        result.mask.buffer as ArrayBuffer,
      ]);
    } else if (type === "embedAndDecodeBitmap") {
      const result = await embedAndDecodeBitmap(
        payload.bitmap,
        payload.cacheKey,
        payload.points
      );
      postStatusNotification("ready");
      postResponse(id, "embedAndDecodeBitmap", result, [
        result.mask.buffer as ArrayBuffer,
      ]);
    } else if (type === "encodeBitmap") {
      await encodeBitmap(payload.bitmap, payload.cacheKey);
      postResponse(id, "encodeBitmap", undefined as void);
    } else if (type === "loadVideoModel") {
      await loadVideoModel();
      postResponse(id, "loadVideoModel", undefined as void);
    } else if (type === "initVideoSession") {
      await initVideoSession(payload.sessionId, payload.bitmap, payload.points);
      postResponse(id, "initVideoSession", undefined as void);
    } else if (type === "propagateVideoFrame") {
      const result = await propagateVideoFrame(
        payload.sessionId,
        payload.bitmap
      );
      postResponse(id, "propagateVideoFrame", result, [
        result.mask.buffer as ArrayBuffer,
      ]);
    } else if (type === "endVideoSession") {
      endVideoSession(payload.sessionId);
      postResponse(id, "endVideoSession", undefined as void);
    } else {
      postError(id, type, `Unknown message type: ${type}`);
    }
  } catch (err) {
    if (type === "embedAndDecode" || type === "embedAndDecodeBitmap") {
      postStatusNotification("failure");
      postErrorNotification({
        kind: "inference_failure",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    postError(id, type, err instanceof Error ? err.message : String(err));
  }
};

self.postMessage({ type: "ready" });
