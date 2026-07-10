/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * How the video-annotation surface sources its media frames:
 *
 * - `extract` — decode frames on demand from the source video via WebCodecs
 *   (no `to_frames` preprocessing). Frame-exact via the demux sample table.
 * - `fetch` — fetch materialized per-frame images (`to_frames(sample_frames=True)`,
 *   `POST /frames`). The ImaVid image path.
 * - `html` — a live `<video>` element tile. Last resort; needs no preprocessing
 *   and no WebCodecs, but its overlay layer can trail the picture under load.
 */
export type DecodeStrategy = "extract" | "fetch" | "html";

/**
 * The capability snapshot the policy decides from. Deliberately plain data (no
 * React, no async) so {@link resolveDecodeStrategy} is a pure, exhaustively
 * unit-testable function; the async gathering of these flags lives in the hook.
 */
export interface DecodeCapabilities {
  /** A source video URL resolved on the sample (extract + html need it). */
  hasVideoSrc: boolean;
  /** The source video is decodable on demand via WebCodecs — `canDecode(uri)`. */
  nativeDecodable: boolean;
  /** Materialized per-frame images exist (`to_frames(sample_frames=True)`). */
  hasFrames: boolean;
  /**
   * A manual override (e.g. `?decode=`/`?tile=`) that short-circuits the
   * policy. Honored verbatim as a debug/testing escape hatch — capability
   * flags are not re-checked.
   */
  forced?: DecodeStrategy;
}

/**
 * The one place the strategy is decided: `canDecode ? extract : hasFrames ?
 * fetch : html`. Total over its inputs (always returns one of the three), so
 * every branch has a concrete rendering path; the degenerate "no media at all"
 * case falls through to `html`, whose tile renders its own empty state.
 */
export function resolveDecodeStrategy(
  caps: DecodeCapabilities,
): DecodeStrategy {
  // A manual override wins outright — it's a debug/testing escape hatch, so we
  // honor it verbatim without re-checking capabilities.
  if (caps.forced) {
    return caps.forced;
  }

  // Preferred: extract frames on demand from the source video (no `to_frames`).
  if (caps.hasVideoSrc && caps.nativeDecodable) {
    return "extract";
  }

  // Next: materialized per-frame images.
  if (caps.hasFrames) {
    return "fetch";
  }

  // Last resort: the live `<video>` element tile.
  return "html";
}

/**
 * Parse a forced-strategy override from a URL query string, for debugging and
 * e2e (bypasses capability detection). Precedence: the canonical
 * `?video-decode=extract|fetch|html` wins; the legacy `?decode=`/`?tile=`
 * params are honored for back-compat. Returns `undefined` when nothing forces.
 */
export function parseForcedStrategy(
  search: string,
): DecodeStrategy | undefined {
  const params = new URLSearchParams(search);

  const canonical = params.get("video-decode");
  if (
    canonical === "extract" ||
    canonical === "fetch" ||
    canonical === "html"
  ) {
    return canonical;
  }

  const decode = params.get("decode");
  if (decode === "native") {
    return "extract";
  }

  if (decode === "frames") {
    return "fetch";
  }

  if (params.get("tile") === "video") {
    return "html";
  }

  return undefined;
}
