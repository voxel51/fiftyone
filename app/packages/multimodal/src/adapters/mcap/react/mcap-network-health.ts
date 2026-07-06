import type { PlaybackStore } from "@fiftyone/playback/src/lib/playback/types";

export interface McapNetworkHealth {
  readonly limited: boolean;
  readonly throughputBytesPerSec: number | null;
  readonly updatedAtMs: number;
}

const IDLE_NETWORK_HEALTH: McapNetworkHealth = {
  limited: false,
  throughputBytesPerSec: null,
  updatedAtMs: 0,
};

export function getMcapNetworkHealth(_store: PlaybackStore): McapNetworkHealth {
  return IDLE_NETWORK_HEALTH;
}

export function shouldDeferMcapIdleWorkForStore(
  _store: PlaybackStore,
  _msSinceSeek: number | null,
): boolean {
  return false;
}
