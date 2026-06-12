import type { McapIndexedReaderLike } from "../reader";
import type {
  McapReadTopicTimeBoundsRequest,
  McapTopicTimeBounds,
} from "../types";

/**
 * Resolves per-topic first/last message times from summary indexes.
 *
 * Auxiliary data for status decoration — never playback-blocking: a
 * reader without chunk indexes (or without the bounds capability) maps
 * every topic to null bounds instead of failing.
 *
 * Bounds are message log times; the only supported timeline (log) maps
 * them 1:1 onto timeline time.
 */
export async function readMcapTopicTimeBounds({
  reader,
  request,
}: {
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadTopicTimeBoundsRequest;
}): Promise<readonly McapTopicTimeBounds[]> {
  if (!reader.readTopicIndexedTimeBounds || reader.chunkIndexes.length === 0) {
    return request.topics.map((topic) => nullBounds(topic));
  }

  const resolved = await reader.readTopicIndexedTimeBounds({
    topics: request.topics,
  });

  return request.topics.map((topic) => {
    const bounds = resolved.get(topic);
    if (!bounds) {
      return nullBounds(topic);
    }

    return {
      firstMessageTimeNs: bounds.firstLogTimeNs,
      lastMessageTimeNs: bounds.lastLogTimeNs,
      topic,
    };
  });
}

function nullBounds(topic: string): McapTopicTimeBounds {
  return {
    firstMessageTimeNs: null,
    lastMessageTimeNs: null,
    topic,
  };
}
