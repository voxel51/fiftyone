import type { SampleRendererProps } from "@fiftyone/plugins";
import { mediaSources as mediaSourcesState } from "@fiftyone/state";
import { useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";

import type { ByteSourceDescriptor } from "../../ir";
import type { EpisodeSource } from "../../ports";
import { episodeSourceAccessKey } from "../../runtime/episode-resources";
import {
  OSS_SOURCE_FACTS_CACHE_PARTITION,
  type SourceFactsScope,
} from "../../runtime/source-facts";
import { episodeByteSourceFromMediaReference } from "../../runtime/episode-byte-source";
import {
  episodeByteSourceFromContext,
  episodeManifestSourceFromContext,
  episodeSourceFromByteSource,
} from "./episode-source";

// Keeps grid load from scaling with tiles x sources: every tile needs the same
// table identified, so identify it once per table instead of once per tile.
const fingerprints = new WeakMap<object, string>();

export function mediaSourcesFingerprint(
  mediaSources: Readonly<Record<string, string>> | null,
): string {
  if (!mediaSources) return "";

  const cached = fingerprints.get(mediaSources);
  if (cached !== undefined) return cached;

  const fingerprint = JSON.stringify(
    Object.entries(mediaSources).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    ),
  );
  fingerprints.set(mediaSources, fingerprint);

  return fingerprint;
}

/** Stable physical and logical source identities for the active episode. */
export function useStableEpisodeSource(ctx: SampleRendererProps["ctx"]): {
  readonly byteSource: ByteSourceDescriptor | null;
  readonly episodeSource: EpisodeSource | null;
  readonly sourceFactsScope: SourceFactsScope | undefined;
} {
  const datasetId = ctx.dataset.datasetId;
  const mediaField = ctx.media?.field ?? null;
  const mediaReference = ctx.media?.mediaReference;
  // Read here rather than where a page arrives: the modal fetches its own
  // sample, so hydrating at the pagers would leave it with unlocated assets
  const mediaSources = useRecoilValue(mediaSourcesState);
  // A reference-backed tile's byte source is the one video the samples page
  // delivered with it; a file-backed sample's is its media path
  const next = mediaReference
    ? episodeByteSourceFromMediaReference(ctx, mediaSources)
    : episodeByteSourceFromContext(ctx);
  const sourceFactsScope = useMemo(
    () =>
      mediaReference
        ? undefined
        : {
            cachePartition: OSS_SOURCE_FACTS_CACHE_PARTITION,
            datasetId,
            mediaField,
          },
    [datasetId, mediaField, mediaReference],
  );
  // An episode source must never outlive the source table it was built from.
  // Tiles mount before the table arrives, so one built without it locates no
  // asset; let that source survive the table landing and the tile is blank for
  // good.
  const mediaSourcesKey = mediaSourcesFingerprint(mediaSources);
  // The episode a source serves, and the URL its tile plays, change
  // independently: a changed URL is the same episode, so it must not
  // rebuild the session that is reading it
  const episodeKey = mediaReference
    ? JSON.stringify([
        "media-reference",
        datasetId,
        mediaReference.key,
        mediaSourcesKey,
      ])
    : "";
  const byteKey = next ? episodeSourceAccessKey(next) : "";
  const ref = useRef<{
    byteKey: string;
    byteSource: ByteSourceDescriptor | null;
    episodeKey: string;
    episodeSource: EpisodeSource | null;
  }>();

  const buildEpisodeSource = () =>
    mediaReference ? episodeManifestSourceFromContext(ctx, mediaSources) : null;
  if (!ref.current) {
    ref.current = {
      byteKey,
      byteSource: next,
      episodeKey,
      episodeSource: buildEpisodeSource(),
    };
  }
  if (ref.current.byteKey !== byteKey) {
    ref.current.byteKey = byteKey;
    ref.current.byteSource = next;
  }
  if (ref.current.episodeKey !== episodeKey) {
    ref.current.episodeKey = episodeKey;
    ref.current.episodeSource = buildEpisodeSource();
  }
  const byteSource = ref.current.byteSource;
  const manifestSource = ref.current.episodeSource;
  const episodeSource = useMemo(
    () =>
      manifestSource ??
      (byteSource && sourceFactsScope
        ? episodeSourceFromByteSource(byteSource, sourceFactsScope)
        : null),
    [byteSource, manifestSource, sourceFactsScope],
  );
  return { byteSource, episodeSource, sourceFactsScope };
}
