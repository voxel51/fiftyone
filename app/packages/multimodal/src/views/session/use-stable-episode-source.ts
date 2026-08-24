import type { SampleRendererProps } from "@fiftyone/plugins";
import { useMemo, useRef } from "react";

import type { ByteSourceDescriptor } from "../../ir";
import type { EpisodeSource } from "../../ports";
import { episodeSourceAccessKey } from "../../runtime";
import {
  episodeByteSourceFromContext,
  episodeManifestSourceFromContext,
  episodeSourceFromByteSource,
} from "./episode-source";

/** Stable physical and logical source identities for the active episode. */
export function useStableEpisodeSource(ctx: SampleRendererProps["ctx"]): {
  readonly byteSource: ByteSourceDescriptor | null;
  readonly episodeSource: EpisodeSource | null;
} {
  const next = episodeByteSourceFromContext(ctx);
  const mediaReference = ctx.media.mediaReference;
  const sourceKey = mediaReference
    ? JSON.stringify([
        "media-reference",
        ctx.dataset.datasetId,
        ctx.sample.sample._id,
        mediaReference.kind,
        mediaReference.version,
        mediaReference.key,
      ])
    : next
      ? episodeSourceAccessKey(next)
      : "";
  const ref = useRef<{
    readonly byteSource: ByteSourceDescriptor | null;
    readonly episodeSource: EpisodeSource | null;
    readonly sourceKey: string;
  }>();

  if (!ref.current || ref.current.sourceKey !== sourceKey) {
    ref.current = {
      byteSource: next,
      episodeSource: mediaReference
        ? episodeManifestSourceFromContext(ctx)
        : null,
      sourceKey,
    };
  }
  const byteSource = ref.current.byteSource;
  const manifestSource = ref.current.episodeSource;
  const episodeSource = useMemo(
    () =>
      manifestSource ??
      (byteSource ? episodeSourceFromByteSource(byteSource) : null),
    [byteSource, manifestSource],
  );
  return { byteSource, episodeSource };
}
