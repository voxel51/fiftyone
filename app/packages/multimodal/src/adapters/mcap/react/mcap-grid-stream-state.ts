import { useBrowserStorage } from "@fiftyone/state";
import { atom, getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";

/**
 * Stored value that preserves the existing first-image-topic preview behavior.
 */
export const MCAP_GRID_STREAM_AUTO = "auto" as const;

const EMPTY_TOPICS: readonly string[] = Object.freeze([]);

type StreamsByDataset = Map<string, Map<string, readonly string[]>>;
type SelectedStreamByDataset = Map<string, string>;

type StreamRegistration = {
  readonly datasetName?: string;
  readonly sampleId?: string;
  readonly topics: readonly string[];
};

const streamsByDatasetAtom = atom<StreamsByDataset>(new Map());
const selectedStreamByDatasetAtom = atom<SelectedStreamByDataset>(new Map());

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

function normalizeSelectedStream(topic: string | null | undefined) {
  const normalized = topic?.trim();
  return normalized ? normalized : MCAP_GRID_STREAM_AUTO;
}

function updateSelectedStream(
  current: SelectedStreamByDataset,
  datasetName: string,
  topic: string
) {
  const normalizedTopic = normalizeSelectedStream(topic);
  if (current.get(datasetName) === normalizedTopic) {
    return current;
  }

  const next = new Map(current);
  next.set(datasetName, normalizedTopic);
  return next;
}

/**
 * Reads all mounted MCAP grid preview streams grouped by dataset and sample.
 */
export function useMcapStreams() {
  return useAtomValue(streamsByDatasetAtom);
}

/**
 * Returns the aggregate preview-stream set for mounted MCAP grid tiles.
 */
export function useMcapStreamSnapshot(datasetName?: string) {
  const streamsByDataset = useMcapStreams();

  return useMemo(() => {
    if (!datasetName) {
      return EMPTY_TOPICS;
    }

    const sampleTopics = streamsByDataset.get(datasetName);
    return sampleTopics
      ? normalizeStreams(Array.from(sampleTopics.values()).flat())
      : EMPTY_TOPICS;
  }, [datasetName, streamsByDataset]);
}

/**
 * Returns a callback that registers streams discovered by one mounted grid tile.
 */
export function useRegisterMcapGridStreamTopics() {
  const setStreamsByDataset = useSetAtom(streamsByDatasetAtom);

  return useCallback(
    ({ datasetName, sampleId, topics }: StreamRegistration) => {
      if (!datasetName || !sampleId) {
        return () => undefined;
      }

      const normalizedTopics = normalizeStreams(topics);
      setStreamsByDataset((current) => {
        const next = new Map(current);
        const sampleTopics = new Map(next.get(datasetName));
        sampleTopics.set(sampleId, normalizedTopics);
        next.set(datasetName, sampleTopics);
        return next;
      });

      return () => {
        setStreamsByDataset((current) => {
          const currentSampleTopics = current.get(datasetName);
          if (!currentSampleTopics) {
            return current;
          }

          const nextSampleTopics = new Map(currentSampleTopics);
          nextSampleTopics.delete(sampleId);

          const next = new Map(current);
          if (nextSampleTopics.size) {
            next.set(datasetName, nextSampleTopics);
          } else {
            next.delete(datasetName);
          }
          return next;
        });
      };
    },
    [setStreamsByDataset]
  );
}

/**
 * Subscribes to the aggregate preview-stream set for mounted MCAP grid tiles.
 */
export function useMcapGridStreamTopics(datasetName?: string) {
  return useMcapStreamSnapshot(datasetName);
}

/**
 * Reads and updates the per-dataset MCAP grid preview stream override.
 */
export function useSelectedStream(datasetName?: string) {
  const key = datasetName
    ? storageKey(datasetName)
    : "mcap-grid-preview-image-topic";
  const [storedTopic, setStoredTopic] = useBrowserStorage<string>(
    key,
    MCAP_GRID_STREAM_AUTO
  );
  const selectedStreamByDataset = useAtomValue(selectedStreamByDatasetAtom);
  const setSelectedStreamByDataset = useSetAtom(selectedStreamByDatasetAtom);

  useEffect(() => {
    if (!datasetName) {
      return;
    }

    setSelectedStreamByDataset((current) =>
      updateSelectedStream(current, datasetName, storedTopic)
    );
  }, [datasetName, setSelectedStreamByDataset, storedTopic]);

  const selectedTopic = datasetName
    ? selectedStreamByDataset.get(datasetName) ?? MCAP_GRID_STREAM_AUTO
    : MCAP_GRID_STREAM_AUTO;

  const setSelected = useCallback(
    (topic: string) => {
      if (!datasetName) {
        return;
      }

      const normalizedTopic = normalizeSelectedStream(topic);
      setSelectedStreamByDataset((current) =>
        updateSelectedStream(current, datasetName, normalizedTopic)
      );
      setStoredTopic(normalizedTopic);
    },
    [datasetName, setSelectedStreamByDataset, setStoredTopic]
  );

  return [selectedTopic, setSelected] as const;
}

/**
 * Reads and updates the per-dataset MCAP grid preview stream override.
 */
export function useMcapGridSelectedStreamTopic(datasetName?: string) {
  return useSelectedStream(datasetName);
}

/**
 * Clears in-memory MCAP grid stream state for tests.
 */
export function __resetMcapGridStreamStateForTests() {
  const store = getDefaultStore();
  store.set(streamsByDatasetAtom, new Map());
  store.set(selectedStreamByDatasetAtom, new Map());
}
