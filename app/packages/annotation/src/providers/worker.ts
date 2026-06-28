import { getFetchFunction, setFetchFunction } from "@fiftyone/utilities";
import * as ort from "onnxruntime-web";
import type {
  DownloadProgress,
  InferenceResult,
  ProviderError,
  ProviderStatus,
  PromptPoint,
  WorkerInbound,
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
  result: WorkerNotifications[T],
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
  transfer: Transferable[] = [],
): void {
  self.postMessage({ id, type, success: true, result }, transfer);
}

function postError(id: number, type: string, error: string): void {
  self.postMessage({ id, type, success: false, error });
}

// ImageNet normalization (SAM2 trained on ImageNet-normalized images)
const IMAGE_MEAN = [0.485, 0.456, 0.406];
const IMAGE_STD = [0.229, 0.224, 0.225];

// Perf instrumentation; logs are tagged "[sam2-perf]". Set false to silence.
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
    `/runtime-assets/models/${family}/${file}`,
  );
  return data.url;
}

const isCOI = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
ort.env.wasm.numThreads = isCOI ? navigator.hardwareConcurrency || 4 : 1;
ort.env.wasm.simd = true;

// Prefer the WebGPU execution provider when the runtime exposes it, falling
// back to WASM per-session (the runtime-optimized `.ort` encoder may be pinned
// to the WASM EP — `loadSession` reports the actual EP).
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
      `webgpuAvailable=${WEBGPU_AVAILABLE}`,
  );
}

// Dev: optimizeDeps.exclude lets ort use its embedded WASM bundle.
// Prod: worker bundling strips the embedded WASM, so point to the emitted files.
if (!import.meta.env?.DEV && import.meta.env?.ORT_WASM_PATH) {
  ort.env.wasm.wasmPaths = import.meta.env.ORT_WASM_PATH;
}

let encoderSession: ort.InferenceSession | null = null;
let decoderSession: ort.InferenceSession | null = null;

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
      `Image fetch failed: ${response.status} ${response.statusText}`,
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
    failureKind: "encoder_failure" | "decoder_failure",
  ): Promise<ort.InferenceSession> {
    let buf: ArrayBuffer;
    try {
      const url = await resolveModelUrl(family, file);
      buf = await loadModelWeights(
        url,
        cacheKey,
        (loaded, total) =>
          postProgressNotification({ file: name, loaded, total }),
        postWarningNotification,
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
            }`,
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
            }`,
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
      "encoder_failure",
    );

  if (!decoderSession)
    decoderSession = await loadSession(
      FAMILY,
      DECODER_FILE,
      DECODER_CACHE_KEY,
      "decoder",
      "decoder_failure",
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
        [1, 3, SAM2_INPUT_SIZE, SAM2_INPUT_SIZE],
      ),
    });
    await decoderSession.run({
      image_embed: enc["image_embed"],
      high_res_feats_0: enc["high_res_feats_0"],
      high_res_feats_1: enc["high_res_feats_1"],
      point_coords: new ort.Tensor(
        "float32",
        new Float32Array([0, 0]),
        [1, 1, 2],
      ),
      point_labels: new ort.Tensor("float32", new Float32Array([1]), [1, 1]),
      mask_input: new ort.Tensor(
        "float32",
        new Float32Array(SAM2_OUTPUT_SIZE * SAM2_OUTPUT_SIZE),
        [1, 1, SAM2_OUTPUT_SIZE, SAM2_OUTPUT_SIZE],
      ),
      has_mask_input: new ort.Tensor("float32", new Float32Array([0]), [1]),
    });
    perfLog("prewarm", { ms: performance.now() - t0 });
  } catch (err) {
    postWarningNotification(
      `Prewarm failed (non-fatal): ${
        err instanceof Error ? err.message : String(err)
      }`,
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
  points: PromptPoint[],
): Promise<InferenceResult> {
  const imageData = await loadImageData(imageUrl);
  return embedAndDecodeFromImageData(
    imageData,
    CACHE_PREFIX + imageUrl,
    points,
  );
}

/**
 * SAM2 against an already-decoded frame bitmap. Mirrors {@link embedAndDecode}
 * but keys the embedding cache on the caller-supplied `cacheKey` instead of a
 * URL.
 */
async function embedAndDecodeBitmap(
  bitmap: ImageBitmap,
  cacheKey: string,
  points: PromptPoint[],
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
    /* useEmbeddingCache */ false,
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
  cacheKey: string,
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
    postWarningNotification,
  );
}

/** Encoder embeddings plus the geometry needed to map masks back to pixels. */
interface ResolvedEmbedding {
  encResults: Record<string, ort.Tensor>;
  geometry: ImageGeometry;
  cacheHit: boolean;
  /** Phase timings folded into the final perf log. */
  marks: { cacheLookupMs: number; preprocessMs: number; encodeMs: number };
}

/** Rebuild encoder-output tensors from a cached embedding entry. */
function tensorsFromCache(
  cached: NonNullable<Awaited<ReturnType<typeof getEmbedding>>>,
): Record<string, ort.Tensor> {
  return {
    image_embed: new ort.Tensor(
      "float32",
      cached.imageEmbed.data,
      cached.imageEmbed.dims,
    ),
    high_res_feats_0: new ort.Tensor(
      "float32",
      cached.highResFeats0.data,
      cached.highResFeats0.dims,
    ),
    high_res_feats_1: new ort.Tensor(
      "float32",
      cached.highResFeats1.data,
      cached.highResFeats1.dims,
    ),
  };
}

/**
 * Encode `imageData` (or reuse a cached embedding for `cacheKey`), returning
 * the encoder outputs and image geometry. GPU-resident outputs are pushed onto
 * `gpuTensors` for the caller to dispose after the decoder reads them; on a
 * cache miss the embedding is stored (fire-and-forget) when `useEmbeddingCache`.
 */
async function resolveEmbedding(
  imageData: ImageData,
  cacheKey: string,
  useEmbeddingCache: boolean,
  gpuTensors: ort.Tensor[],
): Promise<ResolvedEmbedding> {
  if (!encoderSession) throw new Error("Model not loaded");

  let cacheLookupMs = 0;

  if (useEmbeddingCache) {
    const tCache = performance.now();
    const cached = await getEmbedding(cacheKey, postWarningNotification);
    cacheLookupMs = performance.now() - tCache;

    if (cached) {
      try {
        return {
          encResults: tensorsFromCache(cached),
          geometry: cached.processedImage,
          cacheHit: true,
          marks: { cacheLookupMs, preprocessMs: 0, encodeMs: 0 },
        };
      } catch {
        postWarningNotification("Corrupt embedding cache entry, re-encoding");
      }
    }
  }

  postStatusNotification("encoding");
  const tPreprocess = performance.now();
  const processed = preprocessImage(imageData);
  const preprocessMs = performance.now() - tPreprocess;

  const tEncode = performance.now();
  const encResults = await encoderSession.run({
    image: new ort.Tensor("float32", processed.tensor, [
      1,
      3,
      SAM2_INPUT_SIZE,
      SAM2_INPUT_SIZE,
    ]),
  });
  const encodeMs = performance.now() - tEncode;

  for (const t of [
    encResults["image_embed"],
    encResults["high_res_feats_0"],
    encResults["high_res_feats_1"],
  ]) {
    if (t.location !== "cpu") gpuTensors.push(t);
  }

  // embedding payload size (element counts via dims, CPU or GPU)
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
    await storeEmbedding(cacheKey, encResults, processed);
  }

  return {
    encResults,
    geometry: processed,
    cacheHit: false,
    marks: { cacheLookupMs, preprocessMs, encodeMs },
  };
}

/**
 * Download CPU copies of the encoder outputs (a no-op for cpu tensors;
 * releaseData=false keeps GPU buffers alive for the decoder) and persist them.
 * Fire-and-forget: the IDB write runs while the decoder proceeds.
 */
async function storeEmbedding(
  cacheKey: string,
  encResults: Record<string, ort.Tensor>,
  geometry: ImageGeometry,
): Promise<void> {
  const [imageEmbed, highResFeats0, highResFeats1] = (await Promise.all([
    encResults["image_embed"].getData(false),
    encResults["high_res_feats_0"].getData(false),
    encResults["high_res_feats_1"].getData(false),
  ])) as Float32Array[];

  putEmbedding(
    cacheKey,
    {
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
    postWarningNotification,
  );
}

/** Decoder timings folded into the final perf log. */
interface DecodeMarks {
  decodeMs: number;
  postMs: number;
}

/**
 * Run the decoder against `points`, pick the best mask by IoU, and postprocess
 * it back to original-image pixels. The encoder embeddings may be GPU-resident;
 * the decoder reads them in place on the same device.
 */
async function decodeToMask(
  encResults: Record<string, ort.Tensor>,
  geometry: ImageGeometry,
  points: PromptPoint[],
): Promise<{ result: InferenceResult; marks: DecodeMarks }> {
  if (!decoderSession) throw new Error("Model not loaded");

  const n = points.length;
  const coords = new Float32Array(n * 2);
  const labels = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const [sx, sy] = transformPoint(points[i].x, points[i].y);
    coords[i * 2] = sx;
    coords[i * 2 + 1] = sy;
    labels[i] = points[i].label;
  }

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
      [1, 1, SAM2_OUTPUT_SIZE, SAM2_OUTPUT_SIZE],
    ),
    has_mask_input: new ort.Tensor("float32", new Float32Array([0]), [1]),
  });
  const decodeMs = performance.now() - tDecode;

  const tPost = performance.now();
  const result = bestMaskResult(decResults, geometry);
  const postMs = performance.now() - tPost;

  return { result, marks: { decodeMs, postMs } };
}

/** Select the highest-IoU mask and crop/normalize it to the source image. */
function bestMaskResult(
  decResults: Record<string, ort.Tensor>,
  geometry: ImageGeometry,
): InferenceResult {
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

  return {
    mask: postprocessMask(bestMask, geometry, bbox),
    maskWidth: bbox.w,
    maskHeight: bbox.h,
    bbox: normalizeBbox(bbox, geometry),
  };
}

/**
 * Shared SAM2 core: resolve an embedding (cache or encode), decode against
 * `points`, postprocess to the best mask. `cacheKey` is the fully-qualified
 * embedding-cache key (already `CACHE_PREFIX`-prefixed).
 */
async function embedAndDecodeFromImageData(
  imageData: ImageData,
  cacheKey: string,
  points: PromptPoint[],
  useEmbeddingCache = true,
): Promise<InferenceResult> {
  if (points.length === 0)
    throw new Error("At least one prompt point is required");

  const tStart = performance.now();

  // Encoder outputs may be GPU-resident (preferredOutputLocation); release them
  // after the decoder reads them.
  const gpuTensors: ort.Tensor[] = [];

  try {
    const { encResults, geometry, cacheHit, marks } = await resolveEmbedding(
      imageData,
      cacheKey,
      useEmbeddingCache,
      gpuTensors,
    );

    const { result, marks: decodeMarks } = await decodeToMask(
      encResults,
      geometry,
      points,
    );

    perfLog(cacheHit ? "infer(cache-hit)" : "infer(cache-miss)", {
      total: performance.now() - tStart,
      cacheLookup: marks.cacheLookupMs,
      preprocess: marks.preprocessMs,
      encode: marks.encodeMs,
      decode: decodeMarks.decodeMs,
      post: decodeMarks.postMs,
    });

    return result;
  } finally {
    for (const t of gpuTensors) t.dispose();
  }
}

// Worker message handler — dispatched per discriminated `type`.
self.onmessage = async (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data;

  // init carries fetch params (no id / response); mirror them so
  // getFetchFunction() routes through the right backend path
  if (msg.type === "init") {
    const { origin, headers, pathPrefix } = msg.payload;
    setFetchFunction(origin, headers, pathPrefix);
    return;
  }

  const { id, type } = msg;

  try {
    if (msg.type === "loadModel") {
      await loadModel();
      postResponse(id, "loadModel", undefined as void);
    } else if (msg.type === "embedAndDecode") {
      const result = await embedAndDecode(
        msg.payload.imageUrl,
        msg.payload.points,
      );
      postStatusNotification("ready");
      postResponse(id, "embedAndDecode", result, [
        result.mask.buffer as ArrayBuffer,
      ]);
    } else if (msg.type === "embedAndDecodeBitmap") {
      const result = await embedAndDecodeBitmap(
        msg.payload.bitmap,
        msg.payload.cacheKey,
        msg.payload.points,
      );
      postStatusNotification("ready");
      postResponse(id, "embedAndDecodeBitmap", result, [
        result.mask.buffer as ArrayBuffer,
      ]);
    } else if (msg.type === "encodeBitmap") {
      await encodeBitmap(msg.payload.bitmap, msg.payload.cacheKey);
      postResponse(id, "encodeBitmap", undefined as void);
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
