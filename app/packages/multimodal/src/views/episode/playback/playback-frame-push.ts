// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest.
import {
  getIsBuffering,
  getIsPlayPending,
  getStreamValue,
  setStreamValue,
} from "@fiftyone/playback/runtime";
import type { PlaybackStore } from "@fiftyone/playback/runtime";
import type { EpisodeStreamCache } from "../../../runtime";
import type { StreamPlaybackFrame } from "./use-stream-values";
import { setStreamDiagnostics } from "./stream-status-state";

/**
 * Publishes each active stream's frame at `tick` into the playback store.
 *
 * A tick that is not fetched yet keeps the last published frame; a fetched
 * tick with a message replaces it. A fetched tick with no message normally
 * clears the stream (an honest content gap in as-recorded playback) — but
 * while the clock is frozen on a stall (buffering or a pending play press)
 * or the stream's failed fetches were sealed as empty ticks, the last real
 * frame stays up instead of blanking the tile: the time readout is not
 * advancing past real data, so holding is truthful. Seeks also retain the
 * previous frame until the target resolves; tile chrome identifies it as
 * previous content while the target is loading.
 */
export function pushTickToStore(
  activeStreams: string[],
  tick: bigint,
  caches: Map<string, EpisodeStreamCache>,
  lastFrame: Map<string, StreamPlaybackFrame<unknown>>,
  store: PlaybackStore,
  failedStreams: ReadonlySet<string>,
): void {
  const stalled = getIsBuffering(store) || getIsPlayPending(store);
  for (const stream of activeStreams) {
    const cache = caches.get(stream);
    if (!cache) continue;
    const msg = cache.get(tick);
    const viz = msg?.output.visualization ?? null;
    if (msg !== undefined) {
      setStreamDiagnostics(store, stream, msg?.output.diagnostics ?? []);
    }
    let toWrite: StreamPlaybackFrame<unknown> | null;
    if (msg === undefined) {
      toWrite = lastFrame.get(stream) ?? null;
    } else if (msg && viz !== null) {
      toWrite = {
        ageNs: tick >= msg.timestampNs ? tick - msg.timestampNs : 0n,
        contentTimeNs: msg.timestampNs,
        frame: viz,
        requestedTimeNs: tick,
      };
      lastFrame.set(stream, toWrite);
    } else if (
      lastFrame.has(stream) &&
      (stalled || failedStreams.has(stream))
    ) {
      toWrite = lastFrame.get(stream) ?? null;
    } else {
      toWrite = null;
      lastFrame.delete(stream);
    }
    if (getStreamValue(store, stream) === toWrite) continue;
    setStreamValue(store, stream, toWrite);
  }
}
