/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { TextSearchSuggestionsProps } from "@fiftyone/state";
import React from "react";

/** What a search the server runs offers: the previous queries matching the
 * typed text, and any text runs. */
export const HistorySuggestions: React.FC<TextSearchSuggestionsProps> = ({
  query,
  history,
  children,
}) => {
  const q = query.trim().toLowerCase();
  const prompts = React.useMemo(
    () => history.filter((h) => !q || h.toLowerCase().includes(q)),
    [history, q],
  );
  return <>{children({ prompts, freeText: true })}</>;
};
