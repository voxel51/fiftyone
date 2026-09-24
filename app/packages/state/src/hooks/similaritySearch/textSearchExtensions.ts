import { useSyncExternalStore } from "react";
import type { State } from "../../recoil/types";
import type { ExtendedSelectionResetInterface } from "../extendedSelectionReset";

/** What an extension's search is asked: the index, the prompt, and how many
 * matches to return. */
export interface TextSearchRequest {
  datasetName: string;
  brainKey: string;
  /** The run's timestamp, so a key recomputed in place is not served the
   * previous run's cached answers. */
  runTimestamp: string | null;
  query: string;
  /** How many matches the search returns: samples for most indexes, segments
   * for a segment index, where several can fall in one sample. */
  k: number;
  /** The serialized stages of the view the search was typed over, which the
   * published result is narrowed to. An extension that ranks within it
   * returns `k` matches the grid can show, as `SortBySimilarity` does; one
   * that ranks over the whole index can end up with fewer once the view
   * narrows it. */
  view: State.Stage[];
  /** Aborted once this search is cancelled: the view changed, a newer
   * search started, or the field went away. An extension should stop
   * before further work and resolve null; a result it returns anyway is
   * discarded. */
  signal: AbortSignal;
}

/**
 * A search's result, published to the extended selection: it narrows the
 * grid without changing the view, exactly as a selection made in the
 * embeddings panel does.
 */
export interface TextSearchResult {
  /** The extended selection stage, `{ [stage class]: kwargs }`. */
  stage: Record<string, Record<string, unknown>>;
  /** Writes the extension's own selection artifacts, such as where in each
   * sample the matches are, in the same commit as the stage. */
  decorate?: (cb: ExtendedSelectionResetInterface) => void;
}

/**
 * Text search that runs client-side for a similarity method whose indexes
 * the server cannot sort by. Registered by the package that owns the method;
 * the view bar's language search hands such an index's queries to it.
 */
export interface TextSearchExtension {
  /** The brain runs' `config.method` this extension searches. */
  method: string;
  /** Resolves null when a newer search elsewhere replaced this one: nothing
   * publishes, and nothing is reported. */
  search: (request: TextSearchRequest) => Promise<TextSearchResult | null>;
}

const extensions = new Map<string, TextSearchExtension>();
const listeners = new Set<() => void>();
// A new Map per change, so a subscriber's snapshot comparison sees it
let snapshot: ReadonlyMap<string, TextSearchExtension> = new Map();

const publish = () => {
  snapshot = new Map(extensions);
  for (const listener of listeners) listener();
};

/**
 * Registers the text search for one similarity method. Returns the
 * unregister, for HMR disposal.
 */
export function registerTextSearchExtension(
  extension: TextSearchExtension,
): () => void {
  extensions.set(extension.method, extension);
  publish();
  return () => {
    if (extensions.get(extension.method) !== extension) return;
    extensions.delete(extension.method);
    publish();
  };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The registered extensions by method. Re-renders on registration, which
 * can land after first render: extensions register from a lazily loaded
 * module. */
export function useTextSearchExtensions(): ReadonlyMap<
  string,
  TextSearchExtension
> {
  return useSyncExternalStore(subscribe, () => snapshot);
}
