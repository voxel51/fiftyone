import { usePlaybackStore, type PlaybackStore } from "@fiftyone/playback";
import { atom, useAtomValue, type PrimitiveAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import { useMemo } from "react";

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
 * Per-topic status, stored in the surrounding PlaybackProvider's store
 * (the same per-modal-instance store that carries the stream values).
 * React components read via `useMcapTopicStatus`; data stream plumbing and
 * tests that already hold a PlaybackStore use the non-reactive bridge helpers.
 */
// Same writable-shape cast as the playback atoms — jotai's null-ish
// initial value overload would otherwise narrow this to a read-only Atom.
const mcapTopicStatusAtom = atomFamily(
  (_topic: string) =>
    atom<McapTopicStatus>("loading") as PrimitiveAtom<McapTopicStatus>
);

/**
 * Reactive statuses for the given topics, index-aligned with `topics`.
 * Tile chrome (badges, empty states) reads these to summarize the
 * streams behind a tile. Resolves against the surrounding
 * PlaybackProvider's store. Pass a referentially stable array — a new
 * identity re-derives the combined atom.
 */
export function useMcapTopicStatuses(
  topics: readonly string[]
): readonly McapTopicStatus[] {
  const store = usePlaybackStore();
  const statusesAtom = useMemo(
    () => atom((get) => topics.map((topic) => get(mcapTopicStatusAtom(topic)))),
    [topics]
  );
  return useAtomValue(statusesAtom, { store });
}

/** Non-reactive read for the data stream and tests. */
export function getMcapTopicStatus(
  store: PlaybackStore,
  topic: string
): McapTopicStatus {
  return store.get(mcapTopicStatusAtom(topic));
}

/** Non-reactive write for the data stream's status publishing. */
export function setMcapTopicStatus(
  store: PlaybackStore,
  topic: string,
  status: McapTopicStatus
): void {
  store.set(mcapTopicStatusAtom(topic), status);
}
