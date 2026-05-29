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
  const opts: ort.InferenceSession.SessionOptions = {
    executionProviders: ["wasm"],
  };

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
    try {
      return await ort.InferenceSession.create(buf, opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      postErrorNotification({
        kind: failureKind,
        message: `${name} init failed: ${msg}`,
      });
      throw err;
    }
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
  const imageData = bitmapToImageData(bitmap);
  return embedAndDecodeFromImageData(
    imageData,
    CACHE_PREFIX + cacheKey,
    points
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

  await putEmbedding(
    fullKey,
    {
      imageEmbed: {
        data: encResults["image_embed"].data as Float32Array,
        dims: [...encResults["image_embed"].dims],
      },
      highResFeats0: {
        data: encResults["high_res_feats_0"].data as Float32Array,
        dims: [...encResults["high_res_feats_0"].dims],
      },
      highResFeats1: {
        data: encResults["high_res_feats_1"].data as Float32Array,
        dims: [...encResults["high_res_feats_1"].dims],
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
  points: PromptPoint[]
): Promise<InferenceResult> {
  if (!encoderSession || !decoderSession) throw new Error("Model not loaded");

  if (points.length === 0)
    throw new Error("At least one prompt point is required");

  let encResults: Record<string, ort.Tensor>;
  let geometry: ImageGeometry;

  const cached = await getEmbedding(cacheKey, postWarningNotification);
  let cacheHit = false;

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

  if (!cacheHit) {
    postStatusNotification("encoding");
    const processed = preprocessImage(imageData);
    geometry = processed;

    encResults = await encoderSession.run({
      image: new ort.Tensor("float32", processed.tensor, [
        1,
        3,
        SAM2_INPUT_SIZE,
        SAM2_INPUT_SIZE,
      ]),
    });

    // Fire-and-forget: IDB write runs in background while decoder proceeds.
    // Memory LRU is updated synchronously inside putEmbedding before the first await.
    putEmbedding(
      cacheKey,
      {
        // Key names are defined by the ONNX model and must match exactly.
        // Encode — input: "image"; outputs: "image_embed", "high_res_feats_0", "high_res_feats_1"
        imageEmbed: {
          data: encResults["image_embed"].data as Float32Array,
          dims: [...encResults["image_embed"].dims],
        },
        highResFeats0: {
          data: encResults["high_res_feats_0"].data as Float32Array,
          dims: [...encResults["high_res_feats_0"].dims],
        },
        highResFeats1: {
          data: encResults["high_res_feats_1"].data as Float32Array,
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

  // Decode — outputs: "masks", "iou_predictions"
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

  return {
    mask: finalMask,
    maskWidth: bbox.w,
    maskHeight: bbox.h,
    bbox: normalizeBbox(bbox, geometry),
  };
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
