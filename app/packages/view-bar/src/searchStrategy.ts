/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type {
  PromptableSimilarityIndex,
  SearchSources,
  TextSearchSuggestionsProps,
} from "@fiftyone/state";
import type { ComponentType } from "react";

/**
 * One way the language search runs a query: through the server's similarity
 * search operator, or through a registered text search provider. The index a
 * query runs with picks the strategy, and the field reads the rest from it.
 */
export interface SearchStrategy {
  /** A query can run, or may once what the strategy needs has loaded. */
  available: boolean;
  /** The strategy can search where the field is hosted. */
  enabled: boolean;
  /** Runs `query` over `index`, ranking within `sources`; null ranks every
   * source. */
  run: (
    index: PromptableSimilarityIndex,
    query: string,
    k: number,
    sources: string[] | null,
  ) => void;
  /** What the selected index's matches can come from, once asked for; null
   * while unknown, or when the index cannot be narrowed. */
  sources: SearchSources | null;
  /** What the field offers for the typed text while the selected index is
   * searched this way. */
  Suggestions: ComponentType<TextSearchSuggestionsProps>;
}
