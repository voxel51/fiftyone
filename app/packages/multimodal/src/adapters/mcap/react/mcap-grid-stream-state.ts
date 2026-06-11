import { useBrowserStorage } from "@fiftyone/state";
import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Stored value that preserves the existing first-image-topic preview behavior.
 */
export const MCAP_GRID_STREAM_AUTO = "auto" as const;

const EMPTY_STREAMS_SNAPSHOT = Object.freeze({
  topics: [] as readonly string[],
});

type McapGridStreamsSnapshot = {
  readonly topics: readonly string[];
};

type StreamRegistration = {
  readonly datasetName: string | null | undefined;
  readonly sampleId: string | null | undefined;
  readonly topics: readonly string[];
};

const streamsByDataset = new Map<string, Map<string, readonly string[]>>();
const streamSnapshots = new Map<string, McapGridStreamsSnapshot>();
const streamListeners = new Set<() => void>();

const selectedStreamByDataset = new Map<string, string>();
const selectedStreamListeners = new Set<() => void>();

function storageKey(datasetName: string) {
  return `mcap-grid-preview-image-topic:${datasetName}`;
}

function normalizeStreams(topics: readonly string[]) {
  return Array.from(
    new Set(
      topics.map((topic) => topic.trim()).filter((topic) => topic.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function arraysEqual(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function buildStreamsSnapshot(datasetName: string): McapGridStreamsSnapshot {
  const sampleTopics = streamsByDataset.get(datasetName);
  const topics = sampleTopics
    ? normalizeStreams(Array.from(sampleTopics.values()).flat())
    : EMPTY_STREAMS_SNAPSHOT.topics;

  return { topics };
}

function readStreamsSnapshot(
  datasetName: string | null | undefined
): McapGridStreamsSnapshot {
  if (!datasetName) {
    return EMPTY_STREAMS_SNAPSHOT;
  }

  let snapshot = streamSnapshots.get(datasetName);
  if (!snapshot) {
    snapshot = buildStreamsSnapshot(datasetName);
    streamSnapshots.set(datasetName, snapshot);
  }

  return snapshot;
}

function updateStreamsSnapshot(datasetName: string) {
  const previous = readStreamsSnapshot(datasetName);
  const next = buildStreamsSnapshot(datasetName);

  if (arraysEqual(previous.topics, next.topics)) {
    return;
  }

  streamSnapshots.set(datasetName, next);
  streamListeners.forEach((listener) => listener());
}

function subscribeToStreams(listener: () => void) {
  streamListeners.add(listener);
  return () => {
    streamListeners.delete(listener);
  };
}

function normalizeSelectedStream(topic: string | null | undefined) {
  const normalized = topic?.trim();
  return normalized ? normalized : MCAP_GRID_STREAM_AUTO;
}

function readSelectedStream(datasetName: string | null | undefined) {
  if (!datasetName) {
    return MCAP_GRID_STREAM_AUTO;
  }

  return selectedStreamByDataset.get(datasetName) ?? MCAP_GRID_STREAM_AUTO;
}

function setSelectedStream(datasetName: string, topic: string) {
  const normalizedTopic = normalizeSelectedStream(topic);
  if (readSelectedStream(datasetName) === normalizedTopic) {
    return;
  }

  selectedStreamByDataset.set(datasetName, normalizedTopic);
  selectedStreamListeners.forEach((listener) => listener());
}

function subscribeToSelectedStream(listener: () => void) {
  selectedStreamListeners.add(listener);
  return () => {
    selectedStreamListeners.delete(listener);
  };
}

/**
 * Registers previewable streams discovered by one mounted MCAP grid tile.
 */
export function registerMcapGridStreamTopics({
  datasetName,
  sampleId,
  topics,
}: StreamRegistration) {
  if (!datasetName || !sampleId) {
    return () => undefined;
  }

  let sampleTopics = streamsByDataset.get(datasetName);
  if (!sampleTopics) {
    sampleTopics = new Map();
    streamsByDataset.set(datasetName, sampleTopics);
  }

  sampleTopics.set(sampleId, normalizeStreams(topics));
  updateStreamsSnapshot(datasetName);

  return () => {
    const currentSampleTopics = streamsByDataset.get(datasetName);
    if (!currentSampleTopics) {
      return;
    }

    currentSampleTopics.delete(sampleId);
    if (!currentSampleTopics.size) {
      streamsByDataset.delete(datasetName);
    }

    updateStreamsSnapshot(datasetName);
  };
}

/**
 * Subscribes to the aggregate preview-stream set for mounted MCAP grid tiles.
 */
export function useMcapGridStreamTopics(
  datasetName: string | null | undefined
) {
  const getSnapshot = useCallback(
    () => readStreamsSnapshot(datasetName).topics,
    [datasetName]
  );

  return useSyncExternalStore(
    subscribeToStreams,
    getSnapshot,
    () => EMPTY_STREAMS_SNAPSHOT.topics
  );
}

/**
 * Reads and updates the per-dataset MCAP grid preview stream override.
 */
export function useMcapGridSelectedStreamTopic(
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

    setSelectedStream(datasetName, storedTopic);
  }, [datasetName, storedTopic]);

  const getSnapshot = useCallback(
    () => readSelectedStream(datasetName),
    [datasetName]
  );
  const selectedTopic = useSyncExternalStore(
    subscribeToSelectedStream,
    getSnapshot,
    () => MCAP_GRID_STREAM_AUTO
  );

  const setSelected = useCallback(
    (topic: string) => {
      if (!datasetName) {
        return;
      }

      const normalizedTopic = normalizeSelectedStream(topic);
      setSelectedStream(datasetName, normalizedTopic);
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
  streamsByDataset.clear();
  streamSnapshots.clear();
  selectedStreamByDataset.clear();
  streamListeners.forEach((listener) => listener());
  selectedStreamListeners.forEach((listener) => listener());
}
