/**
 * The manifest wire shape, shared by the transport and its consumers.
 *
 * Kept apart from either so that batching a page's requests does not make the
 * transport and the source that consumes it depend on each other.
 */

export type TransportMediaAssetManifest = {
  readonly assets: readonly TransportMediaAsset[];
  /**
   * How long the server says this may be reused, in seconds. It bounds a
   * manifest by the life of the URLs inside it, so no read starts against an
   * authorization that has lapsed - nothing in the byte path can renew one.
   */
  readonly max_age_seconds?: number;
  /**
   * What the server recorded about the episode. Absent from a server that
   * does not record it, in which case a reader falls back to the source's
   * own metadata files - which is a storage round trip each.
   */
  readonly episode?: Readonly<Record<string, unknown>>;
  /**
   * What the source's own `meta/info.json` declares, recorded once for the
   * whole source. Every episode of a source shares that file, so a reader is
   * handed what it says instead of fetching it once per tile. Absent for a
   * source bound before it was recorded, which makes a reader read the file.
   */
  readonly source?: Readonly<Record<string, unknown>>;
};

type TransportMediaAsset = {
  readonly asset_id: string;
  /**
   * The physical resource this asset selects from. Many episodes of a source
   * share one video file, one data shard and one `info.json`, so this - not
   * the per-episode `asset_id` - is what says two reads are the same bytes.
   */
  readonly content_id?: string;
  readonly feature_name?: string | null;
  readonly media_type: string;
  /**
   * Whether reading these bytes costs a round trip, as the server derived it
   * from where they are. A reader sizes its block fills and prefetch by this.
   */
  readonly read_profile?: string;
  readonly role: string;
  readonly selector: TransportMediaAssetSelector;
  // Absent from a manifest derived from the stored reference: import does not
  // record a size, and a ranged reader learns it from its first response
  readonly size_bytes?: number;
  readonly url: string;
};

type TransportMediaAssetSelector =
  | { readonly kind: "whole-file" }
  | {
      readonly coordinate_system: string;
      readonly end: number;
      readonly kind: "row-interval";
      readonly start: number;
    }
  | {
      readonly from_timestamp: number;
      readonly kind: "video-timestamp-interval";
      readonly to_timestamp: number;
    };

/**
 * Ceiling on manifest reuse for a response that carries no bound of its own,
 * and the cap the server's own bound is taken under.
 */
export const MAX_MANIFEST_AGE_MS = 5 * 60 * 1000;

/** How long one manifest may be reused, per the server and this ceiling. */
export function manifestMaxAgeMs(
  manifest: TransportMediaAssetManifest,
): number {
  const maxAge = manifest.max_age_seconds;
  if (typeof maxAge !== "number" || !Number.isFinite(maxAge) || maxAge <= 0) {
    return MAX_MANIFEST_AGE_MS;
  }

  return Math.min(MAX_MANIFEST_AGE_MS, Math.trunc(maxAge * 1000));
}
