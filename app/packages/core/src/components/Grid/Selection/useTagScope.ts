import type { GridSelectionActionContext } from "@fiftyone/multimodal/extensions/grid-selection";
import {
  normalizeSelectionMembers,
  capturedScopeSources,
  type SelectionScope,
} from "@fiftyone/state/src/selection";
import { useEffect, useMemo, useRef, useState } from "react";

/** Metadata and complete membership for one version of the live tag scope. */
export interface TagScope {
  key: string;
  context: GridSelectionActionContext;
  scope: SelectionScope;
}

/** Follow selection changes without silently expanding an empty selection. */
export function useTagScope(context: GridSelectionActionContext) {
  const [allInView, setAllInView] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [resolved, setResolved] = useState<TagScope | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  );
  const latest = useRef(context);
  latest.current = context;
  const key = useMemo(
    () =>
      JSON.stringify([
        context.datasetId,
        context.scopeKey,
        context.source,
        capturedScopeSources(context.groups),
        context.boundary,
        context.view,
        context.preferredGroupSlice,
        context.bucket,
        context.counts,
        context.loading,
        context.error,
        attempt,
      ]),
    [
      context.datasetId,
      context.scopeKey,
      context.source,
      context.groups,
      context.boundary,
      context.view,
      context.preferredGroupSlice,
      context.bucket,
      context.counts,
      context.loading,
      context.error,
      attempt,
    ],
  );
  const empty =
    context.source === "results"
      ? !allInView
      : !context.loading && context.counts.episodes === 0;
  const noResults =
    context.source === "results" &&
    allInView &&
    !context.loading &&
    context.counts.episodes === 0;
  const available = !empty && !noResults && !context.loading && !context.error;

  // This effect retires all-results consent as soon as a selection starts.
  useEffect(() => {
    if (context.source === "explicit") setAllInView(false);
  }, [context.source]);

  // This effect resolves each live scope and ignores superseded responses.
  useEffect(() => {
    if (!available) return undefined;
    let active = true;
    const current = latest.current;
    setError(null);
    void current.resolve().then(
      (scope) => {
        if (active)
          setResolved({
            key,
            context: current,
            scope:
              scope.kind === "members"
                ? {
                    kind: "members",
                    members: normalizeSelectionMembers(scope.members),
                  }
                : scope,
          });
      },
      (cause: unknown) => {
        if (active) setError({ key, message: String(cause) });
      },
    );
    return () => {
      active = false;
    };
  }, [key, available]);

  return {
    empty,
    noResults,
    capture: available && resolved?.key === key ? resolved : null,
    error: context.error ?? (error?.key === key ? error.message : null),
    selectAll: () => setAllInView(true),
    retry: () => setAttempt((value) => value + 1),
  };
}
