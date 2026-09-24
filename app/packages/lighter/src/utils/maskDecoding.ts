/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Mask decode dispatcher. Produces a color-INDEPENDENT white+alpha
 * `ImageBitmap` (for GPU tinting) plus single-channel hit-test pixels. The
 * decode + rasterize + `ImageBitmap` creation run in `maskDecodeWorker`
 * off the main thread when Workers are available, with a main-thread fallback
 * (SSR, tests, CSP-blocked workers, or a worker crash).
 *
 * The bitmap encodes only the mask SHAPE — opaque white where present,
 * transparent elsewhere — so the display color is applied at draw time via the
 * renderer's per-sprite tint and a color change never re-decodes.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";

import { decodeMaskToRaster } from "./maskRaster";
import { decodeHeatmapIndices, type DecodedHeatmap } from "./heatmapIndices";
import type {
  HeatmapIndicesSuccess,
  MaskDecodeRequest,
  MaskDecodeResponse,
  MaskDecodeSuccess,
  MaskIndicesSuccess,
} from "./maskDecodeWorker";
import {
  decodeSegmentationIndices,
  type DecodedSegmentation,
} from "./segmentationIndices";

export interface DecodedMask {
  bitmap: ImageBitmap;
  /** Single-channel pixel data for hit-testing (non-zero = mask). */
  rawPixels: { src: Uint8Array; width: number; height: number };
}

// ---- worker plumbing ----

type WorkerSuccess =
  | MaskDecodeSuccess
  | MaskIndicesSuccess
  | HeatmapIndicesSuccess;

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<
  string,
  {
    resolve: (data: WorkerSuccess) => void;
    reject: (err: Error) => void;
  }
>();

const supportsWorkers = (): boolean =>
  typeof Worker !== "undefined" && typeof window !== "undefined";

const ensureWorker = (): Worker | undefined => {
  if (worker) {
    return worker;
  }
  if (!supportsWorkers()) {
    return undefined;
  }

  try {
    worker = new Worker(new URL("./maskDecodeWorker.ts", import.meta.url), {
      type: "module",
    });
  } catch (err) {
    // `new Worker` can throw synchronously (e.g. CSP `worker-src`). Fall back
    // to the main thread instead of failing the decode.
    console.error("[decodeMask] worker unavailable; main-thread decode:", err);
    worker = undefined;
    return undefined;
  }

  worker.addEventListener(
    "message",
    (event: MessageEvent<MaskDecodeResponse>) => {
      // Destructure once so the discriminated union narrows on `data.ok`.
      const data = event.data;
      const job = pending.get(data.uuid);
      if (!job) {
        return;
      }
      pending.delete(data.uuid);

      if (data.ok) {
        job.resolve(data);
      } else {
        // `in`-narrow (the union discriminant doesn't narrow under this
        // package's tsconfig — cf. maskPathDecoding).
        job.reject(
          new Error("error" in data ? data.error : "mask rasterize failed"),
        );
      }
    },
  );

  worker.addEventListener("error", (event) => {
    // Worker died: fail everyone in flight (callers fall back) and drop the
    // instance so the next decode respawns.
    console.error("[decodeMask] worker crashed; respawning:", event);
    for (const job of pending.values()) {
      job.reject(new Error("mask rasterize worker crashed"));
    }
    pending.clear();
    worker?.terminate();
    worker = undefined;
  });

  return worker;
};

const requestViaWorker = (
  w: Worker,
  request: Omit<MaskDecodeRequest, "uuid">,
): Promise<WorkerSuccess> =>
  new Promise((resolve, reject) => {
    const uuid = String(nextId++);
    pending.set(uuid, { resolve, reject });
    w.postMessage({ ...request, uuid });
  });

const decodeViaWorker = async (
  w: Worker,
  maskData: string | OverlayMask,
): Promise<DecodedMask> => {
  const data = await requestViaWorker(w, { kind: "raster", maskData });

  if (data.kind === "indices" || data.kind === "heatmap") {
    throw new Error("mask worker answered a raster request with indices");
  }

  return {
    bitmap: data.bitmap,
    rawPixels: { src: data.rawPixels, width: data.width, height: data.height },
  };
};

const decodeIndicesViaWorker = async (
  w: Worker,
  maskData: string | OverlayMask,
): Promise<DecodedSegmentation> => {
  const data = await requestViaWorker(w, { kind: "indices", maskData });

  if (data.kind !== "indices") {
    throw new Error("mask worker answered an indices request with a raster");
  }

  return { indices: data.indices, width: data.width, height: data.height };
};

const decodeHeatmapViaWorker = async (
  w: Worker,
  maskData: string | OverlayMask,
  range: readonly [number, number] | undefined,
): Promise<DecodedHeatmap> => {
  const data = await requestViaWorker(w, {
    kind: "heatmap",
    maskData,
    range: range ? [range[0], range[1]] : undefined,
  });

  if (data.kind !== "heatmap") {
    throw new Error("mask worker answered a heatmap request with a raster");
  }

  return {
    indices: data.indices,
    width: data.width,
    height: data.height,
    values: data.values,
    channels: data.channels,
    range: data.range,
  };
};

const decodeOnMainThread = async (
  maskData: string | OverlayMask,
): Promise<DecodedMask> => {
  const { rgba, width, height, rawPixels } = decodeMaskToRaster(maskData);
  const bitmap = await createImageBitmap(
    new ImageData(new Uint8ClampedArray(rgba), width, height),
  );
  return { bitmap, rawPixels: { src: rawPixels, width, height } };
};

/**
 * Decode + rasterize a mask source. Runs off the main thread via
 * `maskDecodeWorker` when possible; falls back to the main thread when
 * Workers are unavailable or the worker fails.
 *
 * @param maskData - Base64-encoded compressed numpy string (inline `mask`), or
 *   a pre-decoded {@link OverlayMask} (`mask_path`).
 */
export async function decodeMask(
  maskData: string | OverlayMask,
): Promise<DecodedMask> {
  const w = ensureWorker();
  if (!w) {
    return decodeOnMainThread(maskData);
  }

  try {
    return await decodeViaWorker(w, maskData);
  } catch (err) {
    console.error(
      "[decodeMask] worker decode failed; main-thread fallback:",
      err,
    );
    return decodeOnMainThread(maskData);
  }
}

/**
 * Decode a segmentation mask to its target indices off the main thread, with
 * the same fallbacks as {@link decodeMask}. The synchronous
 * {@link decodeSegmentationIndices} stays the path of last resort, so a
 * caller that cannot wait (a paint) still gets its indices.
 */
export async function decodeSegmentationIndicesAsync(
  maskData: string | OverlayMask,
): Promise<DecodedSegmentation> {
  const w = ensureWorker();
  if (!w) {
    return decodeSegmentationIndices(maskData);
  }

  try {
    return await decodeIndicesViaWorker(w, maskData);
  } catch (err) {
    console.error(
      "[decodeMask] worker indices decode failed; main-thread fallback:",
      err,
    );
    return decodeSegmentationIndices(maskData);
  }
}

/**
 * Quantize a heatmap to palette indices off the main thread, with the same
 * fallbacks as {@link decodeMask}.
 */
export async function decodeHeatmapIndicesAsync(
  mapData: string | OverlayMask,
  range?: readonly [number, number],
): Promise<DecodedHeatmap> {
  const w = ensureWorker();
  if (!w) {
    return decodeHeatmapIndices(mapData, range);
  }

  try {
    return await decodeHeatmapViaWorker(w, mapData, range);
  } catch (err) {
    console.error(
      "[decodeMask] worker heatmap decode failed; main-thread fallback:",
      err,
    );
    return decodeHeatmapIndices(mapData, range);
  }
}
