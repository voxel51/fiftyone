import { playheadAtom, usePlaybackStore } from "@fiftyone/playback";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";

import {
  byteSourceCacheKey,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
import type { FrameTransformVisualization } from "../../../decoders";
import { MCAP_ACTIVE_TIMELINE } from "../types";
import type { McapResourceClient } from "../types";
import { useMcapDataStream } from "./mcap-data-stream-context";
import type { Mat4 } from "../tf/tf-tree";
import { TfTree } from "../tf/tf-tree";

const TF_TOPIC = "/tf";

interface TfTreeState {
  readonly tree: TfTree | null;
  readonly ready: boolean;
}

// Module-level cache so toggling the lidar annotations off/on doesn't
// re-fetch /tf. Keyed by the source's stable cache key.
const tfTreeCache = new Map<
  string,
  { promise: Promise<TfTree>; tree?: TfTree }
>();

/**
 * One-shot loader: reads every `/tf` message via the resource client,
 * builds a `TfTree`. The data-stream cache stores one message per
 * (tick, topic), which can't represent the latest-per-edge tree we
 * need, so `/tf` is fetched out-of-band here.
 *
 * Mounting kicks off the read; unmounting cancels. Re-runs only when
 * client or source identity changes.
 */
export function useTfTree(
  client: McapResourceClient | null,
  source: ByteSourceDescriptor | null
): TfTreeState {
  const [state, setState] = useState<TfTreeState>({
    tree: null,
    ready: false,
  });

  useEffect(() => {
    if (!client || !source) {
      setState({ tree: null, ready: false });
      return;
    }
    const key = byteSourceCacheKey(source);
    let cancelled = false;
    const entry = ensureCacheEntry(key, client, source);
    if (entry.tree) {
      // Cached — synchronous-equivalent state update.
      setState({ tree: entry.tree, ready: true });
      return;
    }
    setState({ tree: null, ready: false });
    entry.promise
      .then((tree) => {
        if (cancelled) return;
        setState({ tree, ready: true });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ tree: null, ready: false });
      });
    return () => {
      cancelled = true;
    };
  }, [client, source]);

  return state;
}

function ensureCacheEntry(
  key: string,
  client: McapResourceClient,
  source: ByteSourceDescriptor
): { promise: Promise<TfTree>; tree?: TfTree } {
  const cached = tfTreeCache.get(key);
  if (cached) return cached;
  const entry: { promise: Promise<TfTree>; tree?: TfTree } = {
    promise: loadTfTree(client, source).then((tree) => {
      entry.tree = tree;
      return tree;
    }),
  };
  tfTreeCache.set(key, entry);
  return entry;
}

async function loadTfTree(
  client: McapResourceClient,
  source: ByteSourceDescriptor
): Promise<TfTree> {
  const tree = new TfTree();
  for await (const msg of client.readDecodedMessages({
    source,
    topics: [TF_TOPIC],
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
  })) {
    const v = msg.decoded.output.visualization;
    if (!v || v.kind !== "frame-transform") continue;
    const ft = v as FrameTransformVisualization;
    tree.addTransform(
      ft.parentFrameId,
      ft.childFrameId,
      ft.timestampNs,
      ft.translation,
      ft.rotation
    );
  }
  tree.finalize();
  return tree;
}

/**
 * Returns the 4x4 column-major matrix that maps a point in `fromFrame`
 * coordinates into `toFrame` coordinates at the current playhead.
 * Returns `null` until the TF tree is loaded or when the frames aren't
 * connected by any TF chain.
 */
/**
 * Convenience: reads `client` + `source` from the data-stream context
 * and forwards to `useTfTree`. Most consumers should use this — only
 * call `useTfTree` directly when you have client/source from somewhere
 * other than the context (e.g. tests).
 */
export function useMcapTfTree(): TfTreeState {
  const dataStream = useMcapDataStream();
  return useTfTree(dataStream?.client ?? null, dataStream?.source ?? null);
}

export function useTfTransformMatrix(
  tree: TfTree | null,
  fromFrame: string,
  toFrame: string,
  timelineStartNs: bigint
): Mat4 | null {
  const store = usePlaybackStore();
  const playhead = useAtomValue(playheadAtom, { store });
  return useMemo(() => {
    if (!tree) return null;
    const timeNs =
      timelineStartNs + BigInt(Math.round(playhead * 1_000_000_000));
    return tree.lookupChain(fromFrame, toFrame, timeNs);
  }, [tree, fromFrame, toFrame, playhead, timelineStartNs]);
}
