import type { SampleRendererProps } from "@fiftyone/plugins";

import { sampleDescriptorFromContext } from "../../episode-source";
import { useEpisodeSession } from "../../use-episode-session";
import { useStableEpisodeSource } from "../../use-stable-episode-source";
import {
  useEpisodeStreams,
  type EpisodeStreamsState,
} from "./use-episode-streams";

/** Loads format-neutral stream metadata for a sample renderer context. */
export function useEpisodeSampleStreams(
  ctx: SampleRendererProps["ctx"],
): EpisodeStreamsState {
  const { episodeSource } = useStableEpisodeSource(ctx);
  const descriptor = sampleDescriptorFromContext(ctx);
  const state = useEpisodeSession(descriptor, episodeSource);
  return useEpisodeStreams({
    error: state.error,
    session: state.session,
    sourceAvailable: episodeSource !== null,
  });
}
