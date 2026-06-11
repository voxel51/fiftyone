import { useBrowserStorage } from "@fiftyone/state";
import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Stored value that preserves the existing first-image-topic preview behavior.
 */
export const MCAP_GRID_STREAM_AUTO = "auto" as const;

const EMPTY_TOPICS_SNAPSHOT = Object.freeze({
  topics: [] as readonly string[],
});

type McapGridTopicsSnapshot = {
  readonly topics: readonly string[];
};

type TopicRegistration = {
  readonly datasetName: string | null | undefined;
  readonly sampleId: string | null | undefined;
  readonly topics: readonly string[];
};

const topicsByDataset = new Map<string, Map<string, readonly string[]>>();
const topicsSnapshots = new Map<string, McapGridTopicsSnapshot>();
const topicListeners = new Set<() => void>();

const selectedTopicByDataset = new Map<string, string>();
const selectedTopicListeners = new Set<() => void>();

function storageKey(datasetName: string) {
  return `mcap-grid-preview-image-topic:${datasetName}`;
}

function normalizeTopics(topics: readonly string[]) {
  return Array.from(
    new Set(
      topics.map((topic) => topic.trim()).filter((topic) => topic.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function arraysEqual(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function buildTopicsSnapshot(datasetName: string): McapGridTopicsSnapshot {
  const sampleTopics = topicsByDataset.get(datasetName);
  const topics = sampleTopics
    ? normalizeTopics(Array.from(sampleTopics.values()).flat())
    : EMPTY_TOPICS_SNAPSHOT.topics;

  return { topics };
}

function readTopicsSnapshot(
  datasetName: string | null | undefined
): McapGridTopicsSnapshot {
  if (!datasetName) {
    return EMPTY_TOPICS_SNAPSHOT;
  }

  let snapshot = topicsSnapshots.get(datasetName);
  if (!snapshot) {
    snapshot = buildTopicsSnapshot(datasetName);
    topicsSnapshots.set(datasetName, snapshot);
  }

  return snapshot;
}

function updateTopicsSnapshot(datasetName: string) {
  const previous = readTopicsSnapshot(datasetName);
  const next = buildTopicsSnapshot(datasetName);

  if (arraysEqual(previous.topics, next.topics)) {
    return;
  }

  topicsSnapshots.set(datasetName, next);
  topicListeners.forEach((listener) => listener());
}

function subscribeToTopics(listener: () => void) {
  topicListeners.add(listener);
  return () => {
    topicListeners.delete(listener);
  };
}

function normalizeSelectedTopic(topic: string | null | undefined) {
  const normalized = topic?.trim();
  return normalized ? normalized : MCAP_GRID_STREAM_AUTO;
}

function readSelectedTopic(datasetName: string | null | undefined) {
  if (!datasetName) {
    return MCAP_GRID_STREAM_AUTO;
  }

  return selectedTopicByDataset.get(datasetName) ?? MCAP_GRID_STREAM_AUTO;
}

function setSelectedTopic(datasetName: string, topic: string) {
  const normalizedTopic = normalizeSelectedTopic(topic);
  if (readSelectedTopic(datasetName) === normalizedTopic) {
    return;
  }

  selectedTopicByDataset.set(datasetName, normalizedTopic);
  selectedTopicListeners.forEach((listener) => listener());
}

function subscribeToSelectedTopic(listener: () => void) {
  selectedTopicListeners.add(listener);
  return () => {
    selectedTopicListeners.delete(listener);
  };
}

/**
 * Registers image topics discovered by one mounted MCAP grid tile.
 */
export function registerMcapGridImageTopics({
  datasetName,
  sampleId,
  topics,
}: TopicRegistration) {
  if (!datasetName || !sampleId) {
    return () => undefined;
  }

  let sampleTopics = topicsByDataset.get(datasetName);
  if (!sampleTopics) {
    sampleTopics = new Map();
    topicsByDataset.set(datasetName, sampleTopics);
  }

  sampleTopics.set(sampleId, normalizeTopics(topics));
  updateTopicsSnapshot(datasetName);

  return () => {
    const currentSampleTopics = topicsByDataset.get(datasetName);
    if (!currentSampleTopics) {
      return;
    }

    currentSampleTopics.delete(sampleId);
    if (!currentSampleTopics.size) {
      topicsByDataset.delete(datasetName);
    }

    updateTopicsSnapshot(datasetName);
  };
}

/**
 * Subscribes to the aggregate image-topic set for mounted MCAP grid tiles.
 */
export function useMcapGridImageTopics(datasetName: string | null | undefined) {
  const getSnapshot = useCallback(
    () => readTopicsSnapshot(datasetName).topics,
    [datasetName]
  );

  return useSyncExternalStore(
    subscribeToTopics,
    getSnapshot,
    () => EMPTY_TOPICS_SNAPSHOT.topics
  );
}

/**
 * Reads and updates the per-dataset MCAP grid preview image-topic override.
 */
export function useMcapGridSelectedImageTopic(
  datasetName: string | null | undefined
) {
  const key = datasetName
    ? storageKey(datasetName)
    : "mcap-grid-preview-image-topic";
  const [storedTopic, setStoredTopic] = useBrowserStorage<string>(
    key,
    MCAP_GRID_STREAM_AUTO
  );

  useEffect(() => {
    if (!datasetName) {
      return;
    }

    setSelectedTopic(datasetName, storedTopic);
  }, [datasetName, storedTopic]);

  const getSnapshot = useCallback(
    () => readSelectedTopic(datasetName),
    [datasetName]
  );
  const selectedTopic = useSyncExternalStore(
    subscribeToSelectedTopic,
    getSnapshot,
    () => MCAP_GRID_STREAM_AUTO
  );

  const setSelected = useCallback(
    (topic: string) => {
      if (!datasetName) {
        return;
      }

      const normalizedTopic = normalizeSelectedTopic(topic);
      setSelectedTopic(datasetName, normalizedTopic);
      setStoredTopic(normalizedTopic);
    },
    [datasetName, setStoredTopic]
  );

  return [selectedTopic, setSelected] as const;
}

/**
 * Clears in-memory MCAP grid stream state for tests.
 */
export function __resetMcapGridStreamStateForTests() {
  topicsByDataset.clear();
  topicsSnapshots.clear();
  selectedTopicByDataset.clear();
  topicListeners.forEach((listener) => listener());
  selectedTopicListeners.forEach((listener) => listener());
}
