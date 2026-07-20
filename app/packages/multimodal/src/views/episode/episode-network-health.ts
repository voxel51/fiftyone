// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest.
import { usePlaybackStore } from "@fiftyone/playback/runtime";
import { getIsBuffering, getIsPlayPending } from "@fiftyone/playback/runtime";
import type { PlaybackStore } from "@fiftyone/playback/runtime";
import { atom, useAtomValue, type PrimitiveAtom } from "jotai";
import {
  shouldDeferEpisodeIdleWork,
  type EpisodeNetworkHealth,
} from "./episode-network-health-estimator";

const IDLE_NETWORK_HEALTH: EpisodeNetworkHealth = {
  busyFraction: 0,
  busyThroughputBytesPerSec: null,
  limited: false,
  throughputBytesPerSec: null,
  throughputPlannable: false,
  updatedAtMs: 0,
};

const episodeNetworkHealthAtom = atom<EpisodeNetworkHealth>(
  IDLE_NETWORK_HEALTH,
) as PrimitiveAtom<EpisodeNetworkHealth>;

export function useEpisodeNetworkHealth(): EpisodeNetworkHealth {
  const store = usePlaybackStore();
  return useAtomValue(episodeNetworkHealthAtom, { store });
}

export function setEpisodeNetworkHealth(
  store: PlaybackStore,
  health: EpisodeNetworkHealth,
): void {
  store.set(episodeNetworkHealthAtom, health);
}

export function getEpisodeNetworkHealth(
  store: PlaybackStore,
): EpisodeNetworkHealth {
  return store.get(episodeNetworkHealthAtom);
}

export function resetEpisodeNetworkHealth(store: PlaybackStore): void {
  store.set(episodeNetworkHealthAtom, IDLE_NETWORK_HEALTH);
}

export function shouldDeferEpisodeIdleWorkForStore(
  store: PlaybackStore,
  msSinceSeek: number | null,
): boolean {
  return shouldDeferEpisodeIdleWork({
    buffering: getIsBuffering(store),
    limited: getEpisodeNetworkHealth(store).limited,
    msSinceSeek,
    playPending: getIsPlayPending(store),
  });
}
