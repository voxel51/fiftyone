// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// module is imported by unit-tested playback-adjacent code.
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

/**
 * Store-backed idle-work gate: speculative idle reads (background
 * lookahead, paused warmup, transform runway) should yield the link while
 * a constrained network is the reason playback is waiting.
 */
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
