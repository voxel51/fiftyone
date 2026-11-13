import { useCallback, useSyncExternalStore } from "react";
import type { SampleRendererLoadingProps } from "@fiftyone/plugins";

const MAX_SNAPSHOTS = 32;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const MAX_CANVAS_DIMENSION = 512;
const MAX_POSTER_KEYS = 512;
const MAX_POSTER_URLS = 16;

type Thumbnail =
  | { readonly kind: "image"; readonly url: string }
  | { readonly kind: "canvas"; readonly canvas: HTMLCanvasElement };

/** Encoded poster bytes, as the grid poster cache stores them. */
interface EncodedPoster {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

/** The grid's encoded-poster cache, read only for a destination being shown. */
export interface ModalThumbnailPosterCache {
  readonly peek: (posterKey: string) => EncodedPoster | null;
  /** Notifies after any poster is stored. */
  readonly subscribe: (listener: () => void) => () => void;
}

interface Snapshot {
  readonly bytes: number;
  readonly thumbnail: Extract<Thumbnail, { kind: "canvas" }>;
}

interface PosterUrl {
  readonly poster: EncodedPoster;
  readonly thumbnail: Extract<Thumbnail, { kind: "image" }>;
}

const snapshots = new Map<string, Snapshot>();
const posterKeys = new Map<string, string>();
const posterUrls = new Map<string, PosterUrl>();
const listeners = new Set<() => void>();
let snapshotBytes = 0;
let posterCache: ModalThumbnailPosterCache | null = null;
let disconnectPosterCache: (() => void) | null = null;

function keyFor(identity: SampleRendererLoadingProps): string {
  return JSON.stringify([
    identity.datasetId,
    identity.mediaField,
    identity.sampleId,
  ]);
}

function notify(): void {
  for (const listener of listeners) listener();
}

function connectPosterCache(cache: ModalThumbnailPosterCache): void {
  if (posterCache === cache) return;
  disconnectPosterCache?.();
  posterCache = cache;
  disconnectPosterCache = cache.subscribe(() => {
    // A canvas only bridges the encode. Retire it once the current poster is
    // available so later replacements or evictions cannot reveal old pixels.
    for (const key of snapshots.keys()) {
      const posterKey = posterKeys.get(key);
      if (posterKey && cache.peek(posterKey)) releaseSnapshot(key);
    }
    notify();
  });
}

/**
 * Records which grid poster cache entry belongs to a sample, so a destination
 * reached later by click, keyboard, or next/back navigation can show it. No
 * bytes are copied until a modal asks for that destination.
 */
export function registerModalThumbnailPoster(
  identity: SampleRendererLoadingProps,
  posterKey: string,
  cache: ModalThumbnailPosterCache,
): void {
  if (!identity.sampleId) return;
  connectPosterCache(cache);
  const key = keyFor(identity);
  const previous = posterKeys.get(key);
  if (previous !== posterKey) releaseSnapshot(key);
  posterKeys.delete(key);
  posterKeys.set(key, posterKey);
  while (posterKeys.size > MAX_POSTER_KEYS) {
    posterKeys.delete(posterKeys.keys().next().value as string);
  }
  if (previous !== posterKey) notify();
}

/** Captures a drawn 2D poster on activation, before its encoded copy exists. */
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
  const key = keyFor(identity);
  releaseSnapshot(key);
  const bytes = canvas.width * canvas.height * 4;
  snapshots.set(key, { bytes, thumbnail: { kind: "canvas", canvas } });
  snapshotBytes += bytes;
  while (snapshots.size > MAX_SNAPSHOTS || snapshotBytes > MAX_SNAPSHOT_BYTES) {
    const [oldestKey, oldest] = snapshots.entries().next().value as [
      string,
      Snapshot,
    ];
    snapshots.delete(oldestKey);
    snapshotBytes -= oldest.bytes;
    releaseCanvas(oldest.thumbnail.canvas);
  }
  notify();
}

function releaseSnapshot(key: string): void {
  const snapshot = snapshots.get(key);
  if (!snapshot) return;
  snapshots.delete(key);
  snapshotBytes -= snapshot.bytes;
  releaseCanvas(snapshot.thumbnail.canvas);
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

// Object URLs are created once per destination poster and kept for the few
// most recent destinations; the grid cache keeps the encoded bytes.
function posterThumbnail(
  posterKey: string,
  poster: EncodedPoster,
): Extract<Thumbnail, { kind: "image" }> {
  const current = posterUrls.get(posterKey);
  if (current?.poster === poster) {
    posterUrls.delete(posterKey);
    posterUrls.set(posterKey, current);
    return current.thumbnail;
  }
  if (current) URL.revokeObjectURL(current.thumbnail.url);
  posterUrls.delete(posterKey);
  const thumbnail = {
    kind: "image",
    url: URL.createObjectURL(
      new Blob([Uint8Array.from(poster.bytes)], { type: poster.mimeType }),
    ),
  } as const;
  posterUrls.set(posterKey, { poster, thumbnail });
  while (posterUrls.size > MAX_POSTER_URLS) {
    const [oldestKey, oldest] = posterUrls.entries().next().value as [
      string,
      PosterUrl,
    ];
    posterUrls.delete(oldestKey);
    URL.revokeObjectURL(oldest.thumbnail.url);
  }
  return thumbnail;
}

function thumbnailFor(key: string): Thumbnail | null {
  const snapshot = snapshots.get(key);
  if (snapshot) return snapshot.thumbnail;
  const posterKey = posterKeys.get(key);
  const poster = posterKey ? (posterCache?.peek(posterKey) ?? null) : null;
  return posterKey && poster ? posterThumbnail(posterKey, poster) : null;
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
  const snapshot = useCallback(() => thumbnailFor(key), [key]);
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
