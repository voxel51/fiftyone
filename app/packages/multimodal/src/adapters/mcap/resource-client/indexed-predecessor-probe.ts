import type {
  McapIndexedMessageTime,
  McapIndexedReaderLike,
} from "../reader/index";
import { maxBigInt } from "../../../utils/bigint";
import type { McapPredecessorStore } from "./predecessor-store";

export interface IndexedPredecessorProbeResult {
  readonly entriesByTopic: ReadonlyMap<
    string,
    readonly McapIndexedMessageTime[]
  >;
  readonly everyTopicExhausted: boolean;
  readonly probedTopics: readonly string[];
}

/**
 * Resolves one newest-N predecessor round through the shared memo/probe/record
 * protocol. Candidate decoding and domain-specific completion stay with the
 * caller; synchronized reads, transform anchors, and exact placement can
 * therefore share index orchestration without sharing selection policy.
 */
export async function resolveIndexedPredecessorRound({
  extendFromTimeNs,
  indexedMessageTimeNs,
  limitPerTopic,
  nextKnownTimeNs,
  predecessorStore,
  probeTimeNs,
  reader,
  throwIfCancelled,
  timeNs,
  topics,
}: {
  readonly extendFromTimeNs?: bigint;
  readonly indexedMessageTimeNs: (entry: McapIndexedMessageTime) => bigint;
  readonly limitPerTopic: number;
  readonly nextKnownTimeNs: (topic: string) => bigint;
  readonly predecessorStore?: McapPredecessorStore;
  readonly probeTimeNs: bigint;
  readonly reader: McapIndexedReaderLike;
  readonly throwIfCancelled?: () => void;
  readonly timeNs: bigint;
  readonly topics: readonly string[];
}): Promise<IndexedPredecessorProbeResult> {
  const entriesByTopic = new Map<string, readonly McapIndexedMessageTime[]>();
  const probedTopics: string[] = [];

  for (const topic of [...new Set(topics)]) {
    const memoized = predecessorStore?.lookup(topic, timeNs, limitPerTopic);
    if (memoized) {
      entriesByTopic.set(topic, memoized);
      if (extendFromTimeNs !== undefined) {
        predecessorStore?.extend(
          topic,
          extendFromTimeNs,
          nextKnownTimeNs(topic),
        );
      }
      continue;
    }
    probedTopics.push(topic);
  }

  if (probedTopics.length > 0) {
    throwIfCancelled?.();
    const resolved = await reader.readLatestIndexedMessageTimes?.({
      limitPerTopic,
      timeNs: probeTimeNs,
      topics: probedTopics,
    });
    throwIfCancelled?.();
    if (!resolved) {
      return {
        entriesByTopic,
        everyTopicExhausted: false,
        probedTopics,
      };
    }

    for (const topic of probedTopics) {
      const entries = resolved.get(topic) ?? [];
      entriesByTopic.set(topic, entries);
      const entryTimes = entries.map(indexedMessageTimeNs);
      predecessorStore?.record(topic, {
        entries,
        limitPerTopic,
        nextKnownTimeNs: nextKnownTimeNs(topic),
        predecessorTimeNs: entryTimes.length > 0 ? maxBigInt(entryTimes) : null,
      });
    }
  }

  return {
    entriesByTopic,
    everyTopicExhausted: [...new Set(topics)].every(
      (topic) => (entriesByTopic.get(topic)?.length ?? 0) < limitPerTopic,
    ),
    probedTopics,
  };
}
