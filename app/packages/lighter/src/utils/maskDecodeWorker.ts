/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Web worker that decodes + rasterizes a mask into a white+alpha `ImageBitmap`
 * off the main thread, then transfers the bitmap (zero-copy) back. Moves the
 * base64/numpy decode, the per-pixel rasterize, and the `ImageBitmap` creation
 * off the UI thread so dense samples don't allocate/loop on it.
 *
 * Pairs with `maskDecoding.ts` (the dispatcher + main-thread fallback).
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";

import { decodeMaskToRaster } from "./maskRaster";
import {
  decodeSegmentationIndices,
  type SegmentationIndices,
} from "./segmentationIndices";

/** Rasterize a detection mask into a white+alpha bitmap (the default). */
export interface MaskRasterRequest {
  uuid: string;
  kind?: "raster";
  maskData: string | OverlayMask;
}

/**
 * Decode a segmentation mask to its bare target indices, for the renderer's
 * palette lookup. No rasterize: the GPU colors the indices at draw time.
 */
export interface MaskIndicesRequest {
  uuid: string;
  kind: "indices";
  maskData: string | OverlayMask;
}

export type MaskDecodeRequest = MaskRasterRequest | MaskIndicesRequest;

export interface MaskDecodeSuccess {
  uuid: string;
  ok: true;
  /** Absent from responses predating the indices request; means raster. */
  kind?: "raster";
  bitmap: ImageBitmap;
  rawPixels: Uint8Array;
  width: number;
  height: number;
}

export interface MaskIndicesSuccess {
  uuid: string;
  ok: true;
  kind: "indices";
  indices: SegmentationIndices;
  width: number;
  height: number;
}

interface MaskDecodeFailure {
  uuid: string;
  ok: false;
  error: string;
}

export type MaskDecodeResponse =
  | MaskDecodeSuccess
  | MaskIndicesSuccess
  | MaskDecodeFailure;

/** True only when this module is running as a dedicated worker. */
const isWorkerScope = (): boolean => {
  const scope = globalThis as { WorkerGlobalScope?: new () => unknown };
  return (
    typeof scope.WorkerGlobalScope !== "undefined" &&
    self instanceof scope.WorkerGlobalScope
  );
};

const handleMessage = async (event: MessageEvent<MaskDecodeRequest>) => {
  const { uuid, maskData } = event.data;
  const post = (self as DedicatedWorkerGlobalScope).postMessage.bind(self);

  try {
    if (event.data.kind === "indices") {
      const { indices, width, height } = decodeSegmentationIndices(maskData);
      const payload: MaskIndicesSuccess = {
        uuid,
        ok: true,
        kind: "indices",
        indices,
        width,
        height,
      };

      post(payload, [indices.buffer]);
      return;
    }

    const { rgba, width, height, rawPixels } = decodeMaskToRaster(maskData);
    const bitmap = await createImageBitmap(
      new ImageData(new Uint8ClampedArray(rgba), width, height),
    );

    const payload: MaskDecodeSuccess = {
      uuid,
      ok: true,
      kind: "raster",
      bitmap,
      rawPixels,
      width,
      height,
    };

    // Transfer the decoded bitmap + the single-channel buffer zero-copy.
    post(payload, [bitmap, rawPixels.buffer]);
  } catch (err) {
    const payload: MaskDecodeFailure = {
      uuid,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    post(payload);
  }
};

if (isWorkerScope()) {
  self.onmessage = handleMessage;
}
