import type {
  McapPlaybackWorkerPriority,
  McapPlaybackWorkerRequestPayloadByType,
  McapPlaybackWorkerUnaryType,
} from "./playback-worker-types";
import { MCAP_PLAYBACK_WORKER_PRIORITY } from "./playback-worker-types";

const SUPERSESSION_KEY_SEPARATOR = "\0";

export type McapForegroundSupersession = {
  /** Requests with an overlapping key compete for the same output. */
  readonly keys: readonly string[];
  /**
   * Current-frame requests in the same domain belong to one playhead target.
   * Disjoint stream groups for the same target may coexist, while a different
   * target makes every older group in the domain obsolete.
   */
  readonly target?: {
    readonly domain: string;
    readonly value: string;
  };
};

/**
 * Returns keys for request families where a newer user intent makes older
 * work obsolete. Current-frame media is scoped per topic and playhead target;
 * transform placement is scoped per source because only the newest playhead
 * needs to be placed. Playback runway and unrelated RPCs deliberately return
 * no keys.
 */
export function mcapForegroundSupersession<
  Type extends McapPlaybackWorkerUnaryType,
>({
  generation,
  payload,
  priority,
  sourceKey,
  type,
}: {
  readonly generation: number;
  readonly payload: McapPlaybackWorkerRequestPayloadByType[Type];
  readonly priority: McapPlaybackWorkerPriority;
  readonly sourceKey: string;
  readonly type: Type;
}): McapForegroundSupersession {
  if (
    priority === MCAP_PLAYBACK_WORKER_PRIORITY.PLACEMENT_FRAME &&
    type === "readFrameTransformWindow"
  ) {
    return {
      keys: [
        [sourceKey, generation, "frame-transform-placement"].join(
          SUPERSESSION_KEY_SEPARATOR,
        ),
      ],
    };
  }
  if (priority !== MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME) {
    return { keys: [] };
  }
  if (type === "readPointCloudChannel") {
    const { activeColorBy, topic } = payload as {
      readonly activeColorBy: string;
      readonly topic: string;
    };
    return {
      keys: [
        [
          sourceKey,
          generation,
          "point-cloud-channel",
          topic,
          activeColorBy,
        ].join(SUPERSESSION_KEY_SEPARATOR),
      ],
    };
  }
  if (
    type !== "readSynchronizedMessages" &&
    type !== "readSynchronizedMessageBatch"
  ) {
    return { keys: [] };
  }

  const topics = (payload as { readonly topics?: readonly string[] }).topics;
  if (!topics || topics.length === 0) return { keys: [] };
  const keys = [...new Set(topics)].map((topic) =>
    [sourceKey, generation, topic].join(SUPERSESSION_KEY_SEPARATOR),
  );
  if (type !== "readSynchronizedMessages") return { keys };

  const { timeNs } = payload as { readonly timeNs: bigint };
  return {
    keys,
    target: {
      domain: [sourceKey, generation, "current-frame"].join(
        SUPERSESSION_KEY_SEPARATOR,
      ),
      value: timeNs.toString(),
    },
  };
}

/** Whether a newer foreground request makes an older request obsolete. */
export function shouldMcapRequestSupersede(
  older: McapForegroundSupersession,
  newer: McapForegroundSupersession,
): boolean {
  const smaller =
    older.keys.length <= newer.keys.length ? older.keys : newer.keys;
  const larger = smaller === older.keys ? newer.keys : older.keys;
  const largerKeys = new Set(larger);
  if (smaller.some((key) => largerKeys.has(key))) return true;

  return Boolean(
    older.target &&
    newer.target &&
    older.target.domain === newer.target.domain &&
    older.target.value !== newer.target.value,
  );
}
