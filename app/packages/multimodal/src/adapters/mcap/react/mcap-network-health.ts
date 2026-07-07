// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest.
import { usePlaybackStore } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import {
  getIsBuffering,
  getIsPlayPending,
} from "@fiftyone/playback/src/lib/playback/store-access";
import type { PlaybackStore } from "@fiftyone/playback/src/lib/playback/types";
import { atom, useAtomValue, type PrimitiveAtom } from "jotai";
import {
  shouldDeferMcapIdleWork,
  type McapNetworkHealth,
} from "./mcap-network-health-estimator";

const IDLE_NETWORK_HEALTH: McapNetworkHealth = {
  busyFraction: 0,
  limited: false,
  throughputBytesPerSec: null,
  updatedAtMs: 0,
};

const mcapNetworkHealthAtom = atom<McapNetworkHealth>(
  IDLE_NETWORK_HEALTH,
) as PrimitiveAtom<McapNetworkHealth>;

export function useMcapNetworkHealth(): McapNetworkHealth {
  const store = usePlaybackStore();
  return useAtomValue(mcapNetworkHealthAtom, { store });
}

export function setMcapNetworkHealth(
  store: PlaybackStore,
  health: McapNetworkHealth,
): void {
  store.set(mcapNetworkHealthAtom, health);
}

export function getMcapNetworkHealth(store: PlaybackStore): McapNetworkHealth {
  return store.get(mcapNetworkHealthAtom);
}

export function resetMcapNetworkHealth(store: PlaybackStore): void {
  store.set(mcapNetworkHealthAtom, IDLE_NETWORK_HEALTH);
}

export function shouldDeferMcapIdleWorkForStore(
  store: PlaybackStore,
  msSinceSeek: number | null,
): boolean {
  return shouldDeferMcapIdleWork({
    buffering: getIsBuffering(store),
    limited: getMcapNetworkHealth(store).limited,
    msSinceSeek,
    playPending: getIsPlayPending(store),
  });
}
