import type { McapIndexedMessageTime } from "../reader/index";

/**
 * One memoized predecessor resolution for a topic.
 */
export interface McapPredecessorMemoEntry {
  /**
   * Newest indexed entries at or before `predecessorTimeNs`. Empty means
   * the topic has no message at or before that time.
   */
  readonly entries: readonly McapIndexedMessageTime[];

  /**
   * Per-topic limit the entries were resolved with. A memo only answers
   * lookups for the same limit.
   */
  readonly limitPerTopic: number;

  /**
   * Newest entry time among `entries`, or null when empty.
   */
  readonly predecessorTimeNs: bigint | null;

  /**
   * Exclusive upper bound of the interval the memo answers for: the
   * file is known to contain no message for the topic in
   * (predecessorTimeNs, nextKnownTimeNs).
   */
  readonly nextKnownTimeNs: bigint;
}

/**
 * Per-topic, per-limit memo of resolved predecessor lookups for one MCAP
 * source. Keeping limits independent lets synchronized stream reads and
 * transform-anchor reads share the store without evicting each other.
 *
 * Playback advances monotonically through small batch windows, so the
 * same predecessor answers many consecutive batches. Memoizing the
 * resolution together with its validity interval lets steady playback
 * over a sparse stream skip the chunk-index walk entirely.
 */
export interface McapPredecessorStore {
  /**
   * Returns memoized entries valid as the newest-`limitPerTopic`
   * predecessor set for `timeNs`, or undefined on miss.
   */
  lookup(
    topic: string,
    timeNs: bigint,
    limitPerTopic: number,
  ): readonly McapIndexedMessageTime[] | undefined;

  /**
   * Records a resolved predecessor lookup, replacing the prior memo for
   * the same topic and per-topic limit.
   */
  record(topic: string, entry: McapPredecessorMemoEntry): void;

  /**
   * Extends a memo's no-message interval to `toTimeNs` (exclusive) when
   * a later scan proves the topic stays silent across [fromTimeNs,
   * toTimeNs). Ignored unless the proven interval is contiguous with
   * the memo's existing knowledge.
   */
  extend(topic: string, fromTimeNs: bigint, toTimeNs: bigint): void;

  /** Drops every memo (source teardown). */
  clear(): void;
}

/**
 * Creates an in-memory predecessor memo. Size is bounded by the topic
 * count and the small set of limits used by one source, so no eviction is
 * needed.
 */
export function createMcapPredecessorStore(): McapPredecessorStore {
  const memos = new Map<string, Map<number, McapPredecessorMemoEntry>>();

  return {
    lookup(topic, timeNs, limitPerTopic) {
      const memo = memos.get(topic)?.get(limitPerTopic);
      if (!memo) {
        return undefined;
      }

      // "No message at or before X" also answers any earlier time; a
      // concrete predecessor only answers times at or after it.
      const lowerBoundOk =
        memo.predecessorTimeNs === null || memo.predecessorTimeNs <= timeNs;
      return lowerBoundOk && timeNs < memo.nextKnownTimeNs
        ? memo.entries
        : undefined;
    },

    record(topic, entry) {
      const topicMemos = memos.get(topic) ?? new Map();
      topicMemos.set(entry.limitPerTopic, entry);
      memos.set(topic, topicMemos);
    },

    extend(topic, fromTimeNs, toTimeNs) {
      const topicMemos = memos.get(topic);
      if (!topicMemos) {
        return;
      }
      for (const [limit, memo] of topicMemos) {
        if (toTimeNs <= memo.nextKnownTimeNs) {
          continue;
        }
        // A disjoint proven interval can't chain — messages could exist
        // in the unobserved span between the memo and the new knowledge.
        if (fromTimeNs > memo.nextKnownTimeNs) {
          continue;
        }
        topicMemos.set(limit, { ...memo, nextKnownTimeNs: toTimeNs });
      }
    },

    clear() {
      memos.clear();
    },
  };
}
