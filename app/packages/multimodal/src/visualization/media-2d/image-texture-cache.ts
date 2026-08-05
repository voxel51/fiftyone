/**
 * Shared, refcounted cache of decoded image sources. One decode per key,
 * with a separate Three.js texture lease per consumer, no matter how many
 * surfaces display the frame (e.g. the 2D image tile and a 3D camera-frustum
 * image plane showing the same camera message).
 *
 * Keys are opaque strings formed by callers. Episode consumers use
 * {@link imageTextureCacheKey} (recording key + image stream + content
 * time). The per-recording byte-source access key is baked into every key, so entries from
 * different recordings can never collide: no explicit clear at the
 * source-change boundary is needed for correctness. A previous
 * recording's zero-ref entries simply age out of the bounded retention
 * LRU as the new recording's frames arrive, and leased entries are
 * released when their consumers unmount.
 *
 * Model (deliberately dumb — plain maps, no timers/weakrefs/queues):
 * - `acquire` returns a lease; concurrent acquires for one key share the
 *   same in-flight decode promise, but each settled lease receives its own
 *   texture object so independent renderers do not fight over GPU ownership.
 * - The canonical decoded source is disposed exactly once: when its entry has
 *   zero leases AND it is evicted from the retention LRU. Released lease
 *   textures are disposed immediately, while released-but-retained entries are
 *   re-acquired without re-decoding. This kills the per-frame decode churn on
 *   playback batch re-delivery and short seeks without sharing renderer-owned
 *   texture state.
 * - Releasing the last lease mid-decode never cancels or disposes: the
 *   decode settles, then the entry is retained/evicted normally.
 * - Failed decodes evict the entry (no poisoned keys) and the rejection
 *   propagates to every waiter.
 * - An `undefined` key opts out of sharing: the lease wraps a private
 *   decode whose release disposes the handle, preserving the keyless
 *   bytes-identity lifecycle grid previews rely on.
 */
import * as THREE from "three";

import type { ImageTextureHandle } from "./Base2dScene";
import {
  isVisualizationCostObserved,
  recordVisualizationCost,
} from "../render-cost-observer";

type TextureWithNormalized = THREE.Texture & {
  normalized?: boolean;
};

const RGBA_BYTES_PER_PIXEL = 4;

// Dual retention bounds for zero-ref entries. The entry ceiling protects
// small-image workloads from unbounded bookkeeping, while the decoded-byte
// ceiling keeps the same count from retaining hundreds of MiB at camera-scale
// resolutions. Live leases never participate in either limit.
/** Maximum number of zero-ref decoded image sources retained. */
export const IMAGE_TEXTURE_RETENTION_CAP = 32;

/** Maximum RGBA-equivalent bytes retained across zero-ref image sources. */
export const IMAGE_TEXTURE_RETENTION_BYTE_CAP = 128 * 1024 * 1024;

/**
 * One consumer's claim on a cached texture. `release` is idempotent and is
 * the preferred way a consumer gives the texture back.
 */
export interface ImageTextureLease {
  readonly promise: Promise<ImageTextureHandle>;
  readonly release: () => void;
}

/** Runtime counters for the shared decoded-image cache. */
export interface ImageTextureCacheStats {
  /** Decodes actually started (cached misses + keyless decodes). */
  readonly decodeCount: number;
  /** Entries currently tracked: in-flight, leased, or retained. */
  readonly entryCount: number;
  /** Zero-ref entries currently held in the retention LRU. */
  readonly retainedCount: number;
  /** RGBA-equivalent decoded bytes held by zero-ref retained entries. */
  readonly retainedDecodedBytes: number;
}

interface ImageTextureCacheEntry {
  decodedBytes: number;
  handle: ImageTextureHandle | null;
  readonly key: string;
  promise: Promise<ImageTextureHandle>;
  refCount: number;
  readonly retentionGeneration: number;
  state: "pending" | "rejected" | "resolved";
}

// Every tracked entry, keyed by the opaque cache key.
const entries = new Map<string, ImageTextureCacheEntry>();
// Zero-ref resolved entries in insertion order — the retention LRU
// (oldest first). Always a subset of `entries`.
const retained = new Map<string, ImageTextureCacheEntry>();
let decodeCount = 0;
let retainedDecodedBytes = 0;
let retentionGeneration = 0;

/**
 * Canonical shared key for one camera frame:
 * (recording discriminator, image topic, message content time). Both the
 * 2D image tile and the 3D frustum image plane form keys through this
 * helper so their decodes collapse into one cache entry. Newline is the
 * separator — byte-source access keys and stream IDs never contain one.
 */
export function imageTextureCacheKey(
  recordingKey: string,
  imageStream: string,
  contentTimeNs: bigint,
): string {
  return `${recordingKey}\n${imageStream}\n${contentTimeNs.toString()}`;
}

/**
 * Acquires a lease on the texture for `key`, running `decode` only when
 * the key has no live or retained entry. With an `undefined` key the
 * decode is private (no sharing, release disposes) — the keyless
 * lifecycle callers without message identity rely on.
 */
export function acquireImageTexture(
  key: string | undefined,
  decode: () => Promise<ImageTextureHandle>,
): ImageTextureLease {
  if (key === undefined) {
    return acquirePrivateTexture(decode);
  }

  let entry = entries.get(key);
  if (!entry) {
    entry = createEntry(key, decode);
    entries.set(key, entry);
  } else if (entry.refCount === 0) {
    // Re-acquired from retention — leased entries live outside the LRU.
    removeRetainedEntry(entry, "image-texture-retention-hit");
  }
  entry.refCount += 1;

  const target = entry;
  let leasedHandle: ImageTextureHandle | null = null;
  let released = false;
  const promise = entry.promise.then((handle) => {
    const leaseHandle = createLeasedImageTextureHandle(handle, key);
    if (released) {
      leaseHandle.dispose();
    } else {
      leasedHandle = leaseHandle;
    }
    return leaseHandle;
  });

  return {
    promise,
    release: () => {
      if (released) return;
      released = true;
      leasedHandle?.dispose();
      leasedHandle = null;
      releaseEntry(target);
    },
  };
}

/** Dev/test observability — see {@link ImageTextureCacheStats}. */
export function imageTextureCacheStats(): ImageTextureCacheStats {
  return {
    decodeCount,
    entryCount: entries.size,
    retainedCount: retained.size,
    retainedDecodedBytes,
  };
}

/**
 * Disposes and forgets every zero-ref retained entry and invalidates future
 * retention by currently live/in-flight entries. Live leases remain usable,
 * but their eventual release disposes instead of re-entering the cache. Call
 * at a session boundary (e.g. the episode modal closing) so React parent/child
 * cleanup order cannot leave the final visible frame retained.
 */
export function releaseRetainedImageTextures(): void {
  retentionGeneration += 1;
  while (retained.size > 0) {
    const oldest = retained.values().next().value as
      | ImageTextureCacheEntry
      | undefined;
    if (!oldest) break;
    evictRetainedEntry(oldest, "image-texture-retention-flush");
  }
}

/**
 * Test-only: disposes every settled handle and forgets all entries and
 * counters. Callers must not race it against in-flight decodes they
 * still intend to use — an orphaned decode disposes its own handle on
 * settle.
 */
export function resetImageTextureCacheForTests(): void {
  for (const entry of entries.values()) {
    entry.handle?.dispose();
    entry.handle = null;
  }
  entries.clear();
  retained.clear();
  decodeCount = 0;
  retainedDecodedBytes = 0;
  retentionGeneration = 0;
}

function createEntry(
  key: string,
  decode: () => Promise<ImageTextureHandle>,
): ImageTextureCacheEntry {
  const entry: ImageTextureCacheEntry = {
    decodedBytes: 0,
    handle: null,
    key,
    promise: undefined as unknown as Promise<ImageTextureHandle>,
    refCount: 0,
    retentionGeneration,
    state: "pending",
  };

  decodeCount += 1;
  // Bookkeeping is folded into the shared promise so consumers observing
  // settlement always see the entry's final state.
  entry.promise = decode().then(
    (handle) => {
      if (entries.get(key) !== entry) {
        // The cache was reset while this decode was in flight (tests).
        // Nothing tracks the handle anymore, so dispose it here.
        handle.dispose();
        return handle;
      }
      entry.decodedBytes = decodedImageBytes(handle);
      entry.handle = handle;
      entry.state = "resolved";
      if (entry.refCount === 0) {
        // Every lease was released mid-decode; the settled texture goes
        // straight to retention (or eviction) instead of being dropped.
        retainEntry(entry);
      }
      return handle;
    },
    (error) => {
      // Evict so the key is never poisoned; the next acquire re-decodes.
      entry.state = "rejected";
      if (entries.get(key) === entry) {
        entries.delete(key);
      }
      throw error;
    },
  );

  return entry;
}

function releaseEntry(entry: ImageTextureCacheEntry): void {
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  if (entry.state === "resolved" && entries.get(entry.key) === entry) {
    retainEntry(entry);
  }
  // pending: the settle handler retains/evicts once the decode lands.
  // rejected: the entry was already evicted at rejection time.
}

function retainEntry(entry: ImageTextureCacheEntry): void {
  if (entry.retentionGeneration !== retentionGeneration) {
    if (entries.get(entry.key) === entry) {
      entries.delete(entry.key);
    }
    entry.handle?.dispose();
    entry.handle = null;
    observeImageTextureRetention(
      entry,
      "image-texture-retention-session-drop",
      0,
    );
    return;
  }
  if (entry.handle?.retainWhenUnused === false) {
    if (entries.get(entry.key) === entry) {
      entries.delete(entry.key);
    }
    entry.handle.dispose();
    entry.handle = null;
    observeImageTextureRetention(
      entry,
      "image-texture-retention-ineligible",
      0,
    );
    return;
  }
  if (entry.decodedBytes > IMAGE_TEXTURE_RETENTION_BYTE_CAP) {
    // An entry that cannot fit by itself must not flush useful smaller frames
    // before being evicted too. retainEntry only runs after the last lease
    // releases, so the canonical decoded source can be disposed immediately.
    if (entries.get(entry.key) === entry) {
      entries.delete(entry.key);
    }
    entry.handle?.dispose();
    entry.handle = null;
    observeImageTextureRetention(entry, "image-texture-retention-oversize", 0);
    return;
  }
  const addedToRetention = !retained.has(entry.key);
  if (!addedToRetention) {
    // Refresh an explicitly re-retained entry to the newest LRU position
    // without double-counting its bytes.
    retained.delete(entry.key);
  } else {
    retainedDecodedBytes += entry.decodedBytes;
  }
  retained.set(entry.key, entry);
  const evicted: ImageTextureCacheEntry[] = [];
  while (
    retained.size > IMAGE_TEXTURE_RETENTION_CAP ||
    retainedDecodedBytes > IMAGE_TEXTURE_RETENTION_BYTE_CAP
  ) {
    const oldest = retained.values().next().value as
      | ImageTextureCacheEntry
      | undefined;
    if (!oldest) break;
    if (evictRetainedEntry(oldest)) {
      evicted.push(oldest);
    }
  }
  // Emit this synchronous transaction in stable-state order: removals first,
  // then the new retained frame. A reconstructed event curve therefore shows
  // the bounded post-eviction cache, not an unobservable add-before-evict
  // implementation detail.
  for (const evictedEntry of evicted) {
    observeImageTextureRetention(
      evictedEntry,
      "image-texture-retention-evict",
      -evictedEntry.decodedBytes,
    );
  }
  if (addedToRetention && retained.has(entry.key)) {
    observeImageTextureRetention(
      entry,
      "image-texture-retention-add",
      entry.decodedBytes,
    );
  }
}

function removeRetainedEntry(
  entry: ImageTextureCacheEntry,
  operation?: string,
): boolean {
  if (!retained.delete(entry.key)) return false;
  retainedDecodedBytes -= entry.decodedBytes;
  if (operation) {
    observeImageTextureRetention(entry, operation, -entry.decodedBytes);
  }
  return true;
}

function evictRetainedEntry(
  entry: ImageTextureCacheEntry,
  operation?: string,
): boolean {
  if (!removeRetainedEntry(entry)) return false;
  if (entries.get(entry.key) === entry) {
    entries.delete(entry.key);
  }
  entry.handle?.dispose();
  entry.handle = null;
  if (operation) {
    observeImageTextureRetention(entry, operation, -entry.decodedBytes);
  }
  return true;
}

function observeImageTextureRetention(
  entry: ImageTextureCacheEntry,
  operation: string,
  retainedDecodedBytesDelta: number,
): void {
  if (!isVisualizationCostObserved()) return;
  recordVisualizationCost({
    count: 1,
    measurementStatus: "derived",
    operation,
    retainedDecodedBytesDelta,
    sourceHint: entry.key,
    sourceHintKind: "image-texture-key",
    stage:
      retainedDecodedBytesDelta > 0
        ? "resource-allocate"
        : retainedDecodedBytesDelta < 0
          ? "resource-release"
          : "resource-update",
  });
}

function decodedImageBytes(handle: ImageTextureHandle): number {
  const { imageHeight, imageWidth } = handle;
  if (
    !Number.isSafeInteger(imageWidth) ||
    !Number.isSafeInteger(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return 0;
  }
  const bytes = imageWidth * imageHeight * RGBA_BYTES_PER_PIXEL;
  return Number.isSafeInteger(bytes) ? bytes : Number.MAX_SAFE_INTEGER;
}

function createLeasedImageTextureHandle(
  handle: ImageTextureHandle,
  sourceHint: string,
): ImageTextureHandle {
  const template = handle.texture;
  if (template instanceof THREE.DataTexture) {
    const texture = cloneDataTexture(template);
    return observeLeasedImageTexture(
      {
        aspectRatio: handle.aspectRatio,
        imageHeight: handle.imageHeight,
        imageWidth: handle.imageWidth,
        dispose: () => texture.dispose(),
        texture,
      },
      sourceHint,
    );
  }

  // Three.Texture.clone() shares its Source, which can share renderer
  // bookkeeping across independent canvases. Each lease needs its own Source.
  const texture = new THREE.Texture(
    template.image,
    template.mapping as THREE.Mapping,
    template.wrapS,
    template.wrapT,
    template.magFilter,
    template.minFilter,
    template.format as THREE.PixelFormat,
    template.type,
    template.anisotropy,
    template.colorSpace as THREE.ColorSpace,
  );
  texture.name = template.name;
  texture.channel = template.channel;
  texture.internalFormat = template.internalFormat;
  (texture as TextureWithNormalized).normalized = (
    template as TextureWithNormalized
  ).normalized;
  texture.offset.copy(template.offset);
  texture.repeat.copy(template.repeat);
  texture.center.copy(template.center);
  texture.rotation = template.rotation;
  texture.matrixAutoUpdate = template.matrixAutoUpdate;
  texture.matrix.copy(template.matrix);
  texture.generateMipmaps = template.generateMipmaps;
  texture.premultiplyAlpha = template.premultiplyAlpha;
  texture.flipY = template.flipY;
  texture.unpackAlignment = template.unpackAlignment;
  texture.needsUpdate = true;
  return observeLeasedImageTexture(
    {
      aspectRatio: handle.aspectRatio,
      imageHeight: handle.imageHeight,
      imageWidth: handle.imageWidth,
      dispose: () => texture.dispose(),
      texture,
    },
    sourceHint,
  );
}

function observeLeasedImageTexture(
  handle: ImageTextureHandle,
  sourceHint: string,
): ImageTextureHandle {
  if (!isVisualizationCostObserved()) return handle;
  const bytes = handle.imageWidth * handle.imageHeight * 4;
  recordVisualizationCost({
    declaredGpuBytesDelta: bytes,
    measurementStatus: "derived",
    operation: "image-texture-lease",
    sourceHint,
    sourceHintKind: "image-texture-key",
    stage: "resource-allocate",
  });
  let disposed = false;
  return {
    ...handle,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      handle.dispose();
      recordVisualizationCost({
        declaredGpuBytesDelta: -bytes,
        measurementStatus: "derived",
        operation: "image-texture-lease",
        sourceHint,
        sourceHintKind: "image-texture-key",
        stage: "resource-release",
      });
    },
  };
}

function cloneDataTexture(template: THREE.DataTexture): THREE.DataTexture {
  const image = template.image as {
    readonly data: THREE.TypedArray | null;
    readonly height: number;
    readonly width: number;
  };
  const texture = new THREE.DataTexture(
    image.data,
    image.width,
    image.height,
    template.format as THREE.PixelFormat,
    template.type,
    template.mapping as THREE.Mapping,
    template.wrapS,
    template.wrapT,
    template.magFilter,
    template.minFilter,
    template.anisotropy,
    template.colorSpace,
  );
  texture.name = template.name;
  texture.channel = template.channel;
  texture.internalFormat = template.internalFormat;
  texture.offset.copy(template.offset);
  texture.repeat.copy(template.repeat);
  texture.center.copy(template.center);
  texture.rotation = template.rotation;
  texture.matrixAutoUpdate = template.matrixAutoUpdate;
  texture.matrix.copy(template.matrix);
  texture.generateMipmaps = template.generateMipmaps;
  texture.premultiplyAlpha = template.premultiplyAlpha;
  texture.flipY = template.flipY;
  texture.unpackAlignment = template.unpackAlignment;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Keyless path: a single-use lease around a private decode. Release
 * disposes the handle — immediately when settled, or on settle when the
 * consumer released mid-decode (today's cancel semantics).
 */
function acquirePrivateTexture(
  decode: () => Promise<ImageTextureHandle>,
): ImageTextureLease {
  let handle: ImageTextureHandle | null = null;
  let released = false;

  decodeCount += 1;
  const promise = decode().then((decoded) => {
    if (released) {
      decoded.dispose();
    } else {
      handle = decoded;
    }
    return decoded;
  });

  return {
    promise,
    release: () => {
      if (released) return;
      released = true;
      handle?.dispose();
      handle = null;
    },
  };
}

