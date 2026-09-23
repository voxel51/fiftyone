import { useSyncExternalStore } from "react";

/** What a backend's search is asked: the index, the prompt, and how many
 * samples the resulting view keeps. */
export interface TextSearchRequest {
  datasetName: string;
  brainKey: string;
  /** The run's timestamp, so a key recomputed in place is not served the
   * previous run's cached answers. */
  runTimestamp: string | null;
  query: string;
  k: number;
}

/** A serialized view stage, in the shape `useSetView` takes. */
export interface TextSearchStage {
  _cls: string;
  kwargs: [string, unknown][];
}

/** A backend's answer: the stage, and what to show beside the view while it
 * is the search's result. */
export interface TextSearchResult {
  stage: TextSearchStage;
  /** Publishes the search's annotations, such as where in each sample the
   * matches are; applied when the search's view lands. */
  decorate?: () => void;
  /** Withdraws what `decorate` published, once the view is no longer this
   * search's result; leaves anything published since in place. */
  withdraw?: () => void;
}

/**
 * Text search for similarity runs whose backend cannot answer
 * `SortBySimilarity` on the server. The backend runs the search itself and
 * answers with the stage that narrows the view to its matches, plus whatever
 * it annotates those matches with.
 */
export interface TextSearchBackend {
  /** The brain runs' `config.method` this backend searches. */
  method: string;
  search: (request: TextSearchRequest) => Promise<TextSearchResult>;
}

const backends = new Map<string, TextSearchBackend>();
const listeners = new Set<() => void>();
// A new Map per change, so a subscriber's snapshot comparison sees it
let snapshot: ReadonlyMap<string, TextSearchBackend> = new Map();

const publish = () => {
  snapshot = new Map(backends);
  for (const listener of listeners) listener();
};

/**
 * Registers the text search for one similarity method. Returns the
 * unregister, for HMR disposal.
 */
export function registerTextSearchBackend(
  backend: TextSearchBackend,
): () => void {
  backends.set(backend.method, backend);
  publish();
  return () => {
    if (backends.get(backend.method) !== backend) return;
    backends.delete(backend.method);
    publish();
  };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The registered backends by method. Re-renders on registration, which can
 * land after first render: extensions register from a lazily loaded module. */
export function useTextSearchBackends(): ReadonlyMap<
  string,
  TextSearchBackend
> {
  return useSyncExternalStore(subscribe, () => snapshot);
}
