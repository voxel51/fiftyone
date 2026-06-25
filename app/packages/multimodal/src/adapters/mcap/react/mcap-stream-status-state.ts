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
 * - "ready"   — the latest message at or before the current tick is being
 *   shown and is recent.
 * - "stale"   — a frame is being shown but its source message is older
 *   than the staleness threshold (mid-recording sensor dropout). The
 *   frame keeps rendering; the badge keeps it honest.
 * - "gap"     — the tick was fetched and the topic has no message at or
 *   before it. Under latest-at-or-before selection this means the
 *   playhead is before the topic's first message.
 * - "failed"  — repeated fetch/decode failures for this topic. Sticky
 *   until a later fetch for the topic succeeds.
 */
export type McapTopicStatus = "loading" | "ready" | "stale" | "gap" | "failed";

/**
 * Per-topic status, stored in the surrounding PlaybackProvider's store
 * (the same per-modal-instance store that carries the stream values).
 * Private to this module:
 * components read via `useMcapTopicStatuses`, the data stream and tests
 * use the get/set helpers with the store they already hold.
 */
// Same writable-shape cast as the playback atoms — jotai's null-ish
// initial value overload would otherwise narrow this to a read-only Atom.
const mcapTopicStatusAtom = atomFamily(
  (_topic: string) =>
    atom<McapTopicStatus>("loading") as PrimitiveAtom<McapTopicStatus>,
);

/**
 * Per-topic first-message time in timeline seconds, written once per
 * source by the MCAP data stream. Null until resolved (or when the file
 * carries no usable indexes for the topic). Lets tile chrome say "No
 * data until 0:12" instead of a generic gap message.
 */
const mcapTopicStartTimeSecAtom = atomFamily(
  (_topic: string) => atom<number | null>(null) as PrimitiveAtom<number | null>,
);

/**
 * Reactive statuses for the given topics, index-aligned with `topics`.
 * Tile chrome (badges, empty states) reads these to summarize the
 * streams behind a tile. Resolves against the surrounding
 * PlaybackProvider's store. Pass a referentially stable array — a new
 * identity re-derives the combined atom.
 */
export function useMcapTopicStatuses(
  topics: readonly string[],
): readonly McapTopicStatus[] {
  const store = usePlaybackStore();
  const statusesAtom = useMemo(
    () => atom((get) => topics.map((topic) => get(mcapTopicStatusAtom(topic)))),
    [topics],
  );
  return useAtomValue(statusesAtom, { store });
}

/**
 * Reactive first-message times (timeline seconds) for the given topics,
 * index-aligned with `topics`. Pass a referentially stable array.
 */
export function useMcapTopicStartTimes(
  topics: readonly string[],
): readonly (number | null)[] {
  const store = usePlaybackStore();
  const startTimesAtom = useMemo(
    () =>
      atom((get) =>
        topics.map((topic) => get(mcapTopicStartTimeSecAtom(topic))),
      ),
    [topics],
  );
  return useAtomValue(startTimesAtom, { store });
}

/** Non-reactive read for the data stream and tests. */
export function getMcapTopicStatus(
  store: PlaybackStore,
  topic: string,
): McapTopicStatus {
  return store.get(mcapTopicStatusAtom(topic));
}

/** Non-reactive write for the data stream's status publishing. */
export function setMcapTopicStatus(
  store: PlaybackStore,
  topic: string,
  status: McapTopicStatus,
): void {
  store.set(mcapTopicStatusAtom(topic), status);
}

/** Non-reactive write for the data stream's topic-bounds publishing. */
export function setMcapTopicStartTimeSec(
  store: PlaybackStore,
  topic: string,
  startTimeSec: number | null,
): void {
  store.set(mcapTopicStartTimeSecAtom(topic), startTimeSec);
}
