// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest.
import { usePlaybackStore } from "@fiftyone/playback/runtime";
import { getIsBuffering, getIsPlayPending } from "@fiftyone/playback/runtime";
import type { PlaybackStore } from "@fiftyone/playback/runtime";
import { atom, useAtomValue, type PrimitiveAtom } from "jotai";
import {
  shouldDeferIdleWork,
  type NetworkHealth,
} from "./network-health-estimator";

const IDLE_NETWORK_HEALTH: NetworkHealth = {
  busyFraction: 0,
  busyThroughputBytesPerSec: null,
  limited: false,
  throughputBytesPerSec: null,
  throughputPlannable: false,
  updatedAtMs: 0,
};

const networkHealthAtom = atom<NetworkHealth>(
  IDLE_NETWORK_HEALTH,
) as PrimitiveAtom<NetworkHealth>;

export function useNetworkHealth(): NetworkHealth {
  const store = usePlaybackStore();
  return useAtomValue(networkHealthAtom, { store });
}

export function setNetworkHealth(
  store: PlaybackStore,
  health: NetworkHealth,
): void {
  store.set(networkHealthAtom, health);
}

/** Reads the current episode network health without subscribing to changes. */
export function getNetworkHealth(store: PlaybackStore): NetworkHealth {
  return store.get(networkHealthAtom);
}

export function resetNetworkHealth(store: PlaybackStore): void {
  store.set(networkHealthAtom, IDLE_NETWORK_HEALTH);
}

export function shouldDeferIdleWorkForStore(
  store: PlaybackStore,
  msSinceSeek: number | null,
): boolean {
  return shouldDeferIdleWork({
    buffering: getIsBuffering(store),
    limited: getNetworkHealth(store).limited,
    msSinceSeek,
    playPending: getIsPlayPending(store),
  });
}
