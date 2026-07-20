import { atom, getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";

/**
 * Stored value that preserves the existing first-image-stream preview behavior.
 */
export const EPISODE_GRID_STREAM_AUTO = "auto" as const;

const EMPTY_STREAMS: readonly string[] = Object.freeze([]);
const STORAGE_VERSION = "v3";

type StreamsByDataset = Map<string, Map<string, readonly string[]>>;
type SelectedStreamByDataset = Map<string, string>;

type StreamRegistration = {
  readonly datasetName?: string;
  readonly sampleId?: string;
  readonly streams: readonly string[];
};

const streamsByDatasetAtom = atom<StreamsByDataset>(new Map());
const selectedStreamByDatasetAtom = atom<SelectedStreamByDataset>(new Map());
const hydratedSelectionDatasets = new Set<string>();

function storageKey(datasetName: string) {
  return `episode-grid-preview-source-name:${STORAGE_VERSION}:${datasetName}`;
}

function normalizeStreams(streams: readonly string[]) {
  return Array.from(
    new Set(
      streams
        .map((stream) => stream.trim())
        .filter((stream) => stream.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function normalizeSelectedStream(stream: string | null | undefined) {
  const normalized = stream?.trim();
  return normalized ? normalized : EPISODE_GRID_STREAM_AUTO;
}

function updateSelectedStream(
  current: SelectedStreamByDataset,
  datasetName: string,
  stream: string,
) {
  const normalizedStream = normalizeSelectedStream(stream);
  if (current.get(datasetName) === normalizedStream) {
    return current;
  }

  const next = new Map(current);
  next.set(datasetName, normalizedStream);
  return next;
}

function readStoredSelection(datasetName: string): string {
  return readStorageValue(storageKey(datasetName)) ?? EPISODE_GRID_STREAM_AUTO;
}

function readStorageValue(key: string): string | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? normalizeSelectedStream(parsed) : null;
  } catch {
    return null;
  }
}

function writeStoredSelection(datasetName: string, stream: string): void {
  try {
    window.localStorage.setItem(
      storageKey(datasetName),
      JSON.stringify(normalizeSelectedStream(stream)),
    );
  } catch {
    // Browser storage is optional; the in-memory atom remains authoritative.
  }
}

/**
 * Reads all mounted episode grid preview streams grouped by dataset and sample.
 */
export function useEpisodeStreams() {
  return useAtomValue(streamsByDatasetAtom);
}

/**
 * Returns the aggregate preview-stream set for mounted episode grid tiles.
 */
export function useEpisodeStreamSnapshot(datasetName?: string) {
  const streamsByDataset = useEpisodeStreams();

  return useMemo(() => {
    if (!datasetName) {
      return EMPTY_STREAMS;
    }

    const sampleStreams = streamsByDataset.get(datasetName);
    return sampleStreams
      ? normalizeStreams(Array.from(sampleStreams.values()).flat())
      : EMPTY_STREAMS;
  }, [datasetName, streamsByDataset]);
}

/**
 * Returns a callback that registers streams discovered by one mounted grid tile.
 */
export function useRegisterEpisodeGridStreams() {
  const setStreamsByDataset = useSetAtom(streamsByDatasetAtom);

  return useCallback(
    ({ datasetName, sampleId, streams }: StreamRegistration) => {
      if (!datasetName || !sampleId) {
        return () => undefined;
      }

      const normalizedStreams = normalizeStreams(streams);
      setStreamsByDataset((current) => {
        const next = new Map(current);
        const sampleStreams = new Map(next.get(datasetName));
        sampleStreams.set(sampleId, normalizedStreams);
        next.set(datasetName, sampleStreams);
        return next;
      });

      return () => {
        setStreamsByDataset((current) => {
          const currentSampleStreams = current.get(datasetName);
          if (!currentSampleStreams) {
            return current;
          }

          const nextSampleStreams = new Map(currentSampleStreams);
          nextSampleStreams.delete(sampleId);

          const next = new Map(current);
          if (nextSampleStreams.size) {
            next.set(datasetName, nextSampleStreams);
          } else {
            next.delete(datasetName);
          }
          return next;
        });
      };
    },
    [setStreamsByDataset],
  );
}

/**
 * Subscribes to the aggregate preview-stream set for mounted episode grid tiles.
 */
export function useEpisodeGridStreams(datasetName?: string) {
  return useEpisodeStreamSnapshot(datasetName);
}

/**
 * Reads and updates the per-dataset episode grid preview stream override.
 */
export function useSelectedStream(datasetName?: string) {
  const selectedStreamByDataset = useAtomValue(selectedStreamByDatasetAtom);
  const setSelectedStreamByDataset = useSetAtom(selectedStreamByDatasetAtom);
  const storedSelection = useMemo(
    () => (datasetName ? readStoredSelection(datasetName) : null),
    [datasetName],
  );

  // This effect hydrates each dataset once from its persisted selection.
  useEffect(() => {
    if (!datasetName || hydratedSelectionDatasets.has(datasetName)) {
      return;
    }

    hydratedSelectionDatasets.add(datasetName);
    setSelectedStreamByDataset((current) =>
      current.has(datasetName)
        ? current
        : updateSelectedStream(
            current,
            datasetName,
            storedSelection ?? EPISODE_GRID_STREAM_AUTO,
          ),
    );
  }, [datasetName, setSelectedStreamByDataset, storedSelection]);

  const selectedStream = datasetName
    ? (selectedStreamByDataset.get(datasetName) ??
      storedSelection ??
      EPISODE_GRID_STREAM_AUTO)
    : EPISODE_GRID_STREAM_AUTO;

  const setSelected = useCallback(
    (stream: string) => {
      if (!datasetName) {
        return;
      }

      const normalizedStream = normalizeSelectedStream(stream);
      setSelectedStreamByDataset((current) =>
        updateSelectedStream(current, datasetName, normalizedStream),
      );
      writeStoredSelection(datasetName, normalizedStream);
    },
    [datasetName, setSelectedStreamByDataset],
  );

  return [selectedStream, setSelected] as const;
}

/**
 * Reads and updates the per-dataset episode grid preview stream override.
 */
export function useEpisodeGridSelectedStream(datasetName?: string) {
  return useSelectedStream(datasetName);
}

/**
 * Clears in-memory episode grid stream state for tests.
 */
export function __resetEpisodeGridStreamStateForTests() {
  const store = getDefaultStore();
  store.set(streamsByDatasetAtom, new Map());
  store.set(selectedStreamByDatasetAtom, new Map());
  hydratedSelectionDatasets.clear();
}
