import { usePlaybackStore } from "@fiftyone/playback";
import { atom, useAtomValue, type PrimitiveAtom } from "jotai";
import { atomFamily } from "jotai/utils";

/**
 * Per-topic playback readiness at the current playhead tick:
 *
 * - "loading" — the tick isn't cached for this topic yet (fetch in flight
 *   or about to be requested). Tiles keep their previous frame and show a
 *   subtle catching-up indicator.
 * - "ready"   — a decoded message at the current tick is being shown.
 * - "gap"     — the tick was fetched but the topic has no message near it
 *   (sparse stream / seek landed between samples). Tiles show their last
 *   frame with a "no data at this time" hint, or an empty state when no
 *   frame has ever resolved.
 * - "failed"  — repeated fetch/decode failures for this topic. Sticky
 *   until a later fetch for the topic succeeds.
 */
export type McapTopicStatus = "loading" | "ready" | "gap" | "failed";

/**
 * Per-topic status, written by the MCAP data stream through the playback
 * store (same store that carries `streamValueAtom`). Read via
 * `useMcapTopicStatus`.
 */
// Same writable-shape cast as `streamValueAtom` — jotai's null-ish initial
// value overload would otherwise narrow this to a read-only Atom.
export const mcapTopicStatusAtom = atomFamily(
  (_topic: string) =>
    atom<McapTopicStatus>("loading") as PrimitiveAtom<McapTopicStatus>
);

/**
 * Reactive per-topic playback status for tile chrome (badges, empty
 * states). Resolves against the surrounding PlaybackProvider's store.
 */
export function useMcapTopicStatus(topic: string): McapTopicStatus {
  const store = usePlaybackStore();
  return useAtomValue(mcapTopicStatusAtom(topic), { store });
}
