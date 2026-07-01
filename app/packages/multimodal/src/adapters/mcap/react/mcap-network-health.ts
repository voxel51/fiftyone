import { usePlaybackStore, type PlaybackStore } from "@fiftyone/playback";
import { atom, useAtomValue, type PrimitiveAtom } from "jotai";
import type { McapNetworkHealth } from "./mcap-network-health-estimator";

const IDLE_NETWORK_HEALTH: McapNetworkHealth = {
  limited: false,
  throughputBytesPerSec: null,
  updatedAtMs: 0,
};

/**
 * Per-modal health value in the surrounding PlaybackProvider's store,
 * following the same private-atom pattern as the topic status atoms.
 */
const mcapNetworkHealthAtom = atom<McapNetworkHealth>(
  IDLE_NETWORK_HEALTH,
) as PrimitiveAtom<McapNetworkHealth>;

/**
 * Reactive network-health verdict for modal chrome (the top-bar pill).
 */
export function useMcapNetworkHealth(): McapNetworkHealth {
  const store = usePlaybackStore();
  return useAtomValue(mcapNetworkHealthAtom, { store });
}

/** Non-reactive write for the tracker and tests. */
export function setMcapNetworkHealth(
  store: PlaybackStore,
  health: McapNetworkHealth,
): void {
  store.set(mcapNetworkHealthAtom, health);
}

/** Non-reactive read for the tracker and tests. */
export function getMcapNetworkHealth(store: PlaybackStore): McapNetworkHealth {
  return store.get(mcapNetworkHealthAtom);
}

/** Reset helper for unmount/source changes. */
export function resetMcapNetworkHealth(store: PlaybackStore): void {
  store.set(mcapNetworkHealthAtom, IDLE_NETWORK_HEALTH);
}
