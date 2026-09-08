/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Remembers whether a video is decodable on demand via WebCodecs, so the
 * decode-strategy resolver can skip the fetch+demux probe on revisits.
 *
 * Two tiers, both memoized in-process and mirrored to a persistent
 * key-value store (localStorage by default) so the answer survives reloads:
 *
 * - per-codec support (`codec → bool`): the browser's capability for a codec
 *   string (e.g. `avc1.64000d`). Stable across files and sessions — the
 *   highest-value memo, and all a fresh sample needs once its codec is known.
 * - per-sample verdict (`dataset:sampleId → {codec, decodable}`): lets a
 *   revisited sample resolve with no probe at all.
 *
 * The worker's `isConfigSupported` stays authoritative, so a stale entry can't
 * cause a hard failure — at worst one avoidable re-probe.
 */

/** The decodability answer for a specific sample's source video. */
export interface DecodeVerdict {
  /** The demuxed codec string (e.g. `avc1.64000d`). */
  codec: string;
  /** Whether `VideoDecoder.isConfigSupported` accepted it. */
  decodable: boolean;
  /** Audio track present in the container; undefined = unknown. */
  hasAudio?: boolean;
}

/** The slice of the `Storage` interface we use (so tests inject a fake). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Bump to invalidate every persisted entry (keys are namespaced by version,
// so old entries simply stop being read) — required whenever the verdict
// shape gains a field, else stale entries skip the probe that would fill it.
const VERSION = "v2";
const PREFIX = `fo:nd:${VERSION}`;

const sampleKey = (dataset: string, sampleId: string): string =>
  `${PREFIX}:sample:${dataset}:${sampleId}`;

const codecKey = (codec: string): string => `${PREFIX}:codec:${codec}`;

export class NativeDecodeCache {
  private readonly store: KeyValueStore | null;
  private readonly codecMemo = new Map<string, boolean>();
  private readonly sampleMemo = new Map<string, DecodeVerdict>();

  /**
   * `store` defaults to a guarded `localStorage`; pass `null` for a
   * memory-only cache (or a fake in tests). A store whose access throws
   * (privacy mode, SSR) degrades transparently to memory-only.
   */
  constructor(store: KeyValueStore | null = safeLocalStorage()) {
    this.store = store;
  }

  /** Cached verdict for a sample's source video, or `undefined` if unknown. */
  getSampleVerdict(
    dataset: string,
    sampleId: string,
  ): DecodeVerdict | undefined {
    const key = sampleKey(dataset, sampleId);

    const cached = this.sampleMemo.get(key);
    if (cached) {
      return cached;
    }

    const verdict = this.readJSON(key, isVerdict);
    if (verdict) {
      this.sampleMemo.set(key, verdict);
    }

    return verdict;
  }

  /**
   * Record a sample's verdict. Also back-fills the per-codec memo — a verdict
   * for one file settles decodability for every sibling with the same codec.
   */
  setSampleVerdict(
    dataset: string,
    sampleId: string,
    verdict: DecodeVerdict,
  ): void {
    const key = sampleKey(dataset, sampleId);
    this.sampleMemo.set(key, verdict);
    this.writeJSON(key, verdict);
    this.setCodecSupport(verdict.codec, verdict.decodable);
  }

  /** Cached browser support for a codec string, or `undefined` if unknown. */
  getCodecSupport(codec: string): boolean | undefined {
    const cached = this.codecMemo.get(codec);
    if (cached !== undefined) {
      return cached;
    }

    const raw = this.read(codecKey(codec));
    if (raw === "1" || raw === "0") {
      const supported = raw === "1";
      this.codecMemo.set(codec, supported);
      return supported;
    }

    return undefined;
  }

  /** Record browser support for a codec string. */
  setCodecSupport(codec: string, supported: boolean): void {
    this.codecMemo.set(codec, supported);
    this.write(codecKey(codec), supported ? "1" : "0");
  }

  private read(key: string): string | null {
    if (!this.store) {
      return null;
    }

    try {
      return this.store.getItem(key);
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    if (!this.store) {
      return;
    }

    try {
      this.store.setItem(key, value);
    } catch {
      // Quota / privacy-mode failures are non-fatal — the in-memory memo still
      // serves this session.
    }
  }

  private readJSON<T>(
    key: string,
    guard: (v: unknown) => v is T,
  ): T | undefined {
    const raw = this.read(key);
    if (raw === null) {
      return undefined;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return guard(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private writeJSON(key: string, value: unknown): void {
    try {
      this.write(key, JSON.stringify(value));
    } catch {
      // Non-serializable / stringify failure — skip persistence.
    }
  }
}

function isVerdict(value: unknown): value is DecodeVerdict {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Record<string, unknown>;
  return (
    typeof v.codec === "string" &&
    typeof v.decodable === "boolean" &&
    (v.hasAudio === undefined || typeof v.hasAudio === "boolean")
  );
}

/** A guarded `localStorage`, or `null` where it's unavailable (SSR/privacy). */
function safeLocalStorage(): KeyValueStore | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }

    return localStorage;
  } catch {
    return null;
  }
}

/** Process-wide cache instance the app uses. */
export const nativeDecodeCache = new NativeDecodeCache();
