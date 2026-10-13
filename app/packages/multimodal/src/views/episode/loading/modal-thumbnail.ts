import { useCallback, useSyncExternalStore } from "react";
import type { SampleRendererLoadingProps } from "@fiftyone/plugins";

const MAX_ENTRIES = 32;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_CANVAS_DIMENSION = 512;

type Thumbnail =
  | { readonly kind: "image"; readonly url: string }
  | { readonly kind: "canvas"; readonly canvas: HTMLCanvasElement };

interface Entry {
  readonly thumbnail: Thumbnail;
  readonly bytes: number;
  readonly origin: object;
}

const entries = new Map<string, Entry>();
const originTokens = new WeakMap<object, object>();
const listeners = new Set<() => void>();
let retainedBytes = 0;

// Deduplicate without retaining the producer's encoded bytes or live canvas.
function originToken(origin: object): object {
  let token = originTokens.get(origin);
  if (!token) {
    token = {};
    originTokens.set(origin, token);
  }
  return token;
}

function keyFor(identity: SampleRendererLoadingProps): string {
  return JSON.stringify([
    identity.datasetId,
    identity.mediaField,
    identity.sampleId,
  ]);
}

function dispose(entry: Entry): void {
  if (entry.thumbnail.kind === "image") {
    URL.revokeObjectURL(entry.thumbnail.url);
  } else {
    entry.thumbnail.canvas.width = 0;
    entry.thumbnail.canvas.height = 0;
  }
}

function publish(identity: SampleRendererLoadingProps, entry: Entry): void {
  const key = keyFor(identity);
  const previous = entries.get(key);
  if (previous) {
    retainedBytes -= previous.bytes;
    dispose(previous);
    entries.delete(key);
  }
  entries.set(key, entry);
  retainedBytes += entry.bytes;
  while (entries.size > MAX_ENTRIES || retainedBytes > MAX_BYTES) {
    const oldest = entries.entries().next().value as [string, Entry];
    entries.delete(oldest[0]);
    retainedBytes -= oldest[1].bytes;
    dispose(oldest[1]);
  }
  for (const listener of listeners) listener();
}

/** Retains encoded grid/provider posters independently of the renderer module. */
export function publishModalThumbnail(
  identity: SampleRendererLoadingProps,
  poster: { readonly bytes: Uint8Array; readonly mimeType: string },
): void {
  if (!identity.sampleId || poster.bytes.byteLength > MAX_BYTES) return;
  const key = keyFor(identity);
  const previous = entries.get(key);
  const origin = originToken(poster);
  if (previous?.origin === origin) {
    entries.delete(key);
    entries.set(key, previous);
    return;
  }
  const bytes = Uint8Array.from(poster.bytes).buffer;
  publish(identity, {
    bytes: bytes.byteLength,
    origin,
    thumbnail: {
      kind: "image",
      url: URL.createObjectURL(new Blob([bytes], { type: poster.mimeType })),
    },
  });
}

/** Captures native/2D posters on activation before their live surface changes. */
export function captureModalThumbnail(
  identity: SampleRendererLoadingProps,
  source: HTMLCanvasElement,
): void {
  if (!identity.sampleId || !source.width || !source.height) return;
  // Compositor-backed WebGPU canvases do not provide a reliable readback.
  try {
    if (!source.getContext("2d")) return;
  } catch {
    return;
  }
  const scale = Math.min(
    1,
    MAX_CANVAS_DIMENSION / Math.max(source.width, source.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return;
  try {
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    // A CORS-tainted source is not a usable handoff. Keep the loading skeleton.
    context.getImageData(0, 0, 1, 1);
  } catch {
    return;
  }
  publish(identity, {
    bytes: canvas.width * canvas.height * 4,
    origin: originToken(source),
    thumbnail: { kind: "canvas", canvas },
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reads only the destination's thumbnail; never falls back to another sample. */
export function useModalThumbnail(
  identity: SampleRendererLoadingProps,
): Thumbnail | null {
  const key = keyFor(identity);
  const snapshot = useCallback(
    () => entries.get(key)?.thumbnail ?? null,
    [key],
  );
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
