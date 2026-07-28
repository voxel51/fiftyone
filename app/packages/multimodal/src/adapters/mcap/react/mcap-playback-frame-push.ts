// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest.
import {
  getIsBuffering,
  getIsPlayPending,
  getStreamValue,
  setStreamValue,
} from "@fiftyone/playback/src/lib/playback/store-access";
import type { PlaybackStore } from "@fiftyone/playback/src/lib/playback/types";
import type { McapTopicCache } from "./mcap-topic-cache";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";
import { setMcapTopicDiagnostics } from "./mcap-stream-status-state";

/**
 * Publishes each active topic's frame at `tick` into the playback store.
 *
 * A tick that is not fetched yet keeps the last published frame; a fetched
 * tick with a message replaces it. A fetched tick with no message normally
 * clears the topic (an honest content gap in as-recorded playback) — but
 * while the clock is frozen on a stall (buffering or a pending play press)
 * or the topic's failed fetches were sealed as empty ticks, the last real
 * frame stays up instead of blanking the tile: the time readout is not
 * advancing past real data, so holding is truthful. Seeks also retain the
 * previous frame until the target resolves; tile chrome identifies it as
 * previous content while the target is loading.
 */
export function pushTickToStore(
  activeTopics: string[],
  tick: bigint,
  caches: Map<string, McapTopicCache>,
  lastFrame: Map<string, McapTopicPlaybackFrame<unknown>>,
  store: PlaybackStore,
  failedTopics: ReadonlySet<string>,
): void {
  const stalled = getIsBuffering(store) || getIsPlayPending(store);
  for (const topic of activeTopics) {
    const cache = caches.get(topic);
    if (!cache) continue;
    const msg = cache.get(tick);
    const viz = msg?.decoded.output.visualization ?? null;
    if (msg !== undefined) {
      setMcapTopicDiagnostics(
        store,
        topic,
        msg?.decoded.output.diagnostics ?? [],
      );
    }
    let toWrite: McapTopicPlaybackFrame<unknown> | null;
    if (msg === undefined) {
      toWrite = lastFrame.get(topic) ?? null;
    } else if (msg && viz !== null) {
      toWrite = {
        ageNs: tick >= msg.timelineTimeNs ? tick - msg.timelineTimeNs : 0n,
        contentTimeNs: msg.timelineTimeNs,
        frame: viz,
        requestedTimeNs: tick,
      };
      lastFrame.set(topic, toWrite);
    } else if (lastFrame.has(topic) && (stalled || failedTopics.has(topic))) {
      toWrite = lastFrame.get(topic) ?? null;
    } else {
      toWrite = null;
      lastFrame.delete(topic);
    }
    if (getStreamValue(store, topic) === toWrite) continue;
    setStreamValue(store, topic, toWrite);
  }
}
