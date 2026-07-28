/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Web worker that fetches a `mask_path` URL and decodes the response into an
 * {@link OverlayMask}. Runs as a sibling to the main thread so dense samples
 * with many large masks don't block the UI on decode.
 *
 * Pairs with `maskPathDecoding.ts` (the pool manager).
 */

import type { Coloring } from "@fiftyone/looker";
import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import { decodeMaskOnDisk } from "@fiftyone/looker/src/worker/mask-decoder";

interface DecodeRequest {
  uuid: string;
  url: string;
  field: string;
  cls: string;
}

interface DecodeSuccess {
  uuid: string;
  ok: true;
  mask: OverlayMask;
}

interface DecodeFailure {
  uuid: string;
  ok: false;
  error: string;
}

export type DecodeResponse = DecodeSuccess | DecodeFailure;

// `decodeMaskOnDisk` only consults `coloring` in its SEGMENTATION branch;
// detection masks fall through to the default canvas decode path, so a stub
// is sufficient and keeps the worker free of state/recoil dependencies.
const STUB_COLORING = {} as Coloring;

/**
 * True only when this module is running as a dedicated worker.
 */
const isWorkerScope = (): boolean => {
  // `WorkerGlobalScope` is only a runtime global inside a worker; reach it via
  // `globalThis` so this type-checks without the `webworker` lib.
  const scope = globalThis as { WorkerGlobalScope?: new () => unknown };
  return (
    typeof scope.WorkerGlobalScope !== "undefined" &&
    self instanceof scope.WorkerGlobalScope
  );
};

const handleMessage = async (event: MessageEvent<DecodeRequest>) => {
  const { uuid, url, field, cls } = event.data;

  // Defensive: callers should never reach the worker with a non-string URL,
  // but if they do, `fetch(undefined)` coerces to `fetch("undefined")` and
  // produces phantom requests against the page origin. Fail fast instead.
  if (typeof url !== "string" || url.length === 0) {
    const payload: DecodeFailure = {
      uuid,
      ok: false,
      error: `invalid url: ${String(url)}`,
    };
    (self as DedicatedWorkerGlobalScope).postMessage(payload);
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const payload: DecodeFailure = {
        uuid,
        ok: false,
        error: `fetch ${url} → HTTP ${response.status}`,
      };

      (self as DedicatedWorkerGlobalScope).postMessage(payload);
      return;
    }
    const blob = await response.blob();
    const mask = await decodeMaskOnDisk(blob, cls, field, STUB_COLORING);

    if (!mask) {
      const payload: DecodeFailure = {
        uuid,
        ok: false,
        error: "decodeMaskOnDisk returned no mask",
      };

      (self as DedicatedWorkerGlobalScope).postMessage(payload);
      return;
    }

    const payload: DecodeSuccess = { uuid, ok: true, mask };

    (self as DedicatedWorkerGlobalScope).postMessage(payload, [mask.buffer]);
  } catch (err) {
    const payload: DecodeFailure = {
      uuid,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };

    (self as DedicatedWorkerGlobalScope).postMessage(payload);
  }
};

if (isWorkerScope()) {
  self.onmessage = handleMessage;
}
