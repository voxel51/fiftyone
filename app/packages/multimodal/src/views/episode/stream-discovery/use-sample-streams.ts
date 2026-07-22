import type { SampleRendererProps } from "@fiftyone/plugins";

import { sampleDescriptorFromContext } from "../../session/episode-source";
import { useEpisodeSession } from "../../session/use-episode-session";
import { useStableEpisodeSource } from "../../session/use-stable-episode-source";
import { useStreams, type StreamsState } from "./use-streams";

/** Loads format-neutral stream metadata for a sample renderer context. */
export function useSampleStreams(
  ctx: SampleRendererProps["ctx"],
): StreamsState {
  const { episodeSource } = useStableEpisodeSource(ctx);
  const descriptor = sampleDescriptorFromContext(ctx);
  const state = useEpisodeSession(descriptor, episodeSource);
  return useStreams({
    error: state.error,
    session: state.session,
    sourceAvailable: episodeSource !== null,
  });
}
