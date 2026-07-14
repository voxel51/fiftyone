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

export interface MaskDecodeRequest {
  uuid: string;
  maskData: string | OverlayMask;
}

interface MaskDecodeSuccess {
  uuid: string;
  ok: true;
  bitmap: ImageBitmap;
  rawPixels: Uint8Array;
  width: number;
  height: number;
}

interface MaskDecodeFailure {
  uuid: string;
  ok: false;
  error: string;
}

export type MaskDecodeResponse = MaskDecodeSuccess | MaskDecodeFailure;

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
    const { rgba, width, height, rawPixels } = decodeMaskToRaster(maskData);
    const bitmap = await createImageBitmap(
      new ImageData(new Uint8ClampedArray(rgba), width, height)
    );

    const payload: MaskDecodeSuccess = {
      uuid,
      ok: true,
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
