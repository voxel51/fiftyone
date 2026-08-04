import type {
  McapPlaybackWorkerPriority,
  McapPlaybackWorkerRequestPayloadByType,
  McapPlaybackWorkerUnaryType,
} from "./playback-worker-types";
import { MCAP_PLAYBACK_WORKER_PRIORITY } from "./playback-worker-types";

const SUPERSESSION_KEY_SEPARATOR = "\0";

/**
 * Returns keys for request families where a newer user intent makes older
 * work obsolete. Current-frame media is scoped per topic; transform placement
 * is scoped per source because only the newest playhead needs to be placed.
 * Playback runway and unrelated RPCs deliberately return no keys.
 */
export function mcapForegroundSupersessionKeys<
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
}): readonly string[] {
  if (
    priority === MCAP_PLAYBACK_WORKER_PRIORITY.PLACEMENT_FRAME &&
    type === "readFrameTransformWindow"
  ) {
    return [
      [sourceKey, generation, "frame-transform-placement"].join(
        SUPERSESSION_KEY_SEPARATOR,
      ),
    ];
  }
  if (priority !== MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME) {
    return [];
  }
  if (type === "readPointCloudChannel") {
    const { activeColorBy, topic } = payload as {
      readonly activeColorBy: string;
      readonly topic: string;
    };
    return [
      [sourceKey, generation, "point-cloud-channel", topic, activeColorBy].join(
        SUPERSESSION_KEY_SEPARATOR,
      ),
    ];
  }
  if (
    type !== "readSynchronizedMessages" &&
    type !== "readSynchronizedMessageBatch"
  ) {
    return [];
  }

  const topics = (payload as { readonly topics?: readonly string[] }).topics;
  if (!topics || topics.length === 0) return [];
  return [...new Set(topics)].map((topic) =>
    [sourceKey, generation, topic].join(SUPERSESSION_KEY_SEPARATOR),
  );
}

/** Whether two foreground presentation requests compete for any stream. */
export function haveMcapSupersessionKeyOverlap(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const smaller = left.length <= right.length ? left : right;
  const larger = smaller === left ? right : left;
  const largerKeys = new Set(larger);
  return smaller.some((key) => largerKeys.has(key));
}
