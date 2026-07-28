import type { DecodedResourceHints } from "./types";

/**
 * Builds decoded-output resource hints for transferable typed-array payloads.
 */
export function resourceHintsForArrayBufferViews(
  ...views: readonly ArrayBufferView[]
): DecodedResourceHints {
  const transferables = new Set<ArrayBuffer>();
  let sizeBytes = 0;

  for (const view of views) {
    sizeBytes += view.byteLength;
    if (view.buffer instanceof ArrayBuffer) {
      transferables.add(view.buffer);
    }
  }

  return {
    sizeBytes,
    transferables: [...transferables],
  };
}
