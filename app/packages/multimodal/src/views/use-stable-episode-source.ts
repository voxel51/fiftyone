import type { SampleRendererProps } from "@fiftyone/plugins";
import { useMemo, useRef } from "react";

import type { ByteSourceDescriptor } from "../ir";
import type { EpisodeSource } from "../ports";
import { byteSourceAccessKey } from "../query/bytes";
import {
  episodeByteSourceFromContext,
  episodeSourceFromByteSource,
} from "./episode-source";

/** Stable physical and logical source identities for the active episode. */
export function useStableEpisodeSource(ctx: SampleRendererProps["ctx"]): {
  readonly byteSource: ByteSourceDescriptor | null;
  readonly episodeSource: EpisodeSource | null;
} {
  const next = episodeByteSourceFromContext(ctx);
  const sourceKey = next ? byteSourceAccessKey(next) : "";
  const ref = useRef<{
    readonly byteSource: ByteSourceDescriptor | null;
    readonly sourceKey: string;
  }>();

  if (!ref.current || ref.current.sourceKey !== sourceKey) {
    ref.current = { byteSource: next, sourceKey };
  }
  const byteSource = ref.current.byteSource;
  const episodeSource = useMemo(
    () => (byteSource ? episodeSourceFromByteSource(byteSource) : null),
    [byteSource],
  );
  return { byteSource, episodeSource };
}
