import {
  getGridPosterCache,
  recordGridPosterDiagnostic,
  shouldReplaceGridPoster,
  type GridPosterCacheEntry,
  type GridPosterCacheKey,
} from "./grid-poster-cache";

const WEBP_MIME_TYPE = "image/webp";
const PNG_MIME_TYPE = "image/png";
const WEBP_QUALITY = 0.8;
const DEFAULT_MAX_PENDING_CAPTURES = 16;

type OwnedCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface GridPosterCapture {
  readonly entry: Omit<GridPosterCacheEntry, "bytes">;
  readonly key: GridPosterCacheKey;
  readonly source: HTMLCanvasElement;
}

export interface GridPosterEncoderOptions {
  readonly cloneCanvas?: (source: HTMLCanvasElement) => OwnedCanvas;
  readonly concurrency?: number;
  readonly encode?: (
    canvas: OwnedCanvas,
    mimeType: string,
    quality?: number,
  ) => Promise<Blob | null>;
  readonly maxPendingCaptures?: number;
}

interface EncodeJob extends Omit<GridPosterCapture, "source"> {
  readonly canvas: OwnedCanvas;
}

export interface GridPosterEncoder {
  capture(capture: GridPosterCapture): void;
  reset(): void;
}

export function createGridPosterEncoder(
  options: GridPosterEncoderOptions = {},
): GridPosterEncoder {
  const normalizeLimit = (value: number | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(1, Math.floor(value))
      : fallback;
  const concurrency = normalizeLimit(options.concurrency, 2);
  const cloneCanvas = options.cloneCanvas ?? cloneDisplayCanvas;
  const encode = options.encode ?? encodeCanvas;
  const maxPendingCaptures = normalizeLimit(
    options.maxPendingCaptures,
    DEFAULT_MAX_PENDING_CAPTURES,
  );
  const pending = new Map<GridPosterCacheKey, EncodeJob>();
  const order: GridPosterCacheKey[] = [];
  let active = 0;
  let generation = 0;

  const pump = () => {
    while (active < concurrency && order.length > 0) {
      const key = order.shift();
      if (!key) continue;
      const job = pending.get(key);
      if (!job) continue;
      pending.delete(key);
      if (!shouldReplaceGridPoster(getGridPosterCache().peek(key), job.entry)) {
        releaseCanvas(job.canvas);
        continue;
      }
      active += 1;
      const jobGeneration = generation;
      recordGridPosterDiagnostic("encodesStarted");
      void encodeJob(job, encode)
        .then((entry) => {
          if (!entry || jobGeneration !== generation) return;
          const cache = getGridPosterCache();
          if (
            shouldReplaceGridPoster(cache.peek(job.key), entry) &&
            cache.put(job.key, entry)
          ) {
            recordGridPosterDiagnostic("encodesCompleted");
          }
        })
        .catch(() => {
          recordGridPosterDiagnostic("encodesFailed");
        })
        .finally(() => {
          releaseCanvas(job.canvas);
          active -= 1;
          pump();
        });
    }
  };

  return {
    capture(capture) {
      try {
        if (
          !shouldReplaceGridPoster(
            getGridPosterCache().peek(capture.key),
            capture.entry,
          )
        ) {
          return;
        }
        const job = { ...capture, canvas: cloneCanvas(capture.source) };
        const previous = pending.get(capture.key);
        if (previous) {
          releaseCanvas(previous.canvas);
          recordGridPosterDiagnostic("encodesCoalesced");
        } else {
          order.push(capture.key);
        }
        pending.set(capture.key, job);
        while (order.length > maxPendingCaptures) {
          const droppedKey = order.shift();
          if (!droppedKey) break;
          const droppedJob = pending.get(droppedKey);
          if (!droppedJob) continue;
          pending.delete(droppedKey);
          releaseCanvas(droppedJob.canvas);
        }
        pump();
      } catch {
        recordGridPosterDiagnostic("encodesFailed");
      }
    },
    reset() {
      generation += 1;
      for (const job of pending.values()) releaseCanvas(job.canvas);
      pending.clear();
      order.length = 0;
    },
  };
}

let singleton = createGridPosterEncoder();

export function captureGridPoster(capture: GridPosterCapture): void {
  singleton.capture(capture);
}

export function resetGridPosterEncoderForTests(
  options?: GridPosterEncoderOptions,
): void {
  singleton.reset();
  singleton = createGridPosterEncoder(options);
}

async function encodeJob(
  job: EncodeJob,
  encode: NonNullable<GridPosterEncoderOptions["encode"]>,
): Promise<GridPosterCacheEntry | null> {
  let blob = await encode(job.canvas, WEBP_MIME_TYPE, WEBP_QUALITY);
  if (!validBlob(blob, WEBP_MIME_TYPE)) {
    blob = await encode(job.canvas, PNG_MIME_TYPE);
  }
  if (!validBlob(blob, PNG_MIME_TYPE) && !validBlob(blob, WEBP_MIME_TYPE)) {
    throw new Error("Grid poster encoding returned no supported image");
  }
  return {
    ...job.entry,
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mimeType: blob.type,
  };
}

function validBlob(blob: Blob | null, mimeType: string): blob is Blob {
  return blob !== null && blob.size > 0 && blob.type === mimeType;
}

function cloneDisplayCanvas(source: HTMLCanvasElement): OwnedCanvas {
  const width = Math.max(1, source.width);
  const height = Math.max(1, source.height);
  if (typeof OffscreenCanvas !== "undefined") {
    const clone = new OffscreenCanvas(width, height);
    const context = clone.getContext("2d");
    if (!context) throw new Error("Unable to clone grid poster canvas");
    context.drawImage(source, 0, 0);
    return clone;
  }
  const clone = document.createElement("canvas");
  clone.width = width;
  clone.height = height;
  const context = clone.getContext("2d");
  if (!context) throw new Error("Unable to clone grid poster canvas");
  context.drawImage(source, 0, 0);
  return clone;
}

async function encodeCanvas(
  canvas: OwnedCanvas,
  mimeType: string,
  quality?: number,
): Promise<Blob | null> {
  if (canvas instanceof HTMLCanvasElement) {
    return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
  }
  return canvas.convertToBlob({ quality, type: mimeType });
}

function releaseCanvas(canvas: OwnedCanvas): void {
  canvas.width = 0;
  canvas.height = 0;
}
