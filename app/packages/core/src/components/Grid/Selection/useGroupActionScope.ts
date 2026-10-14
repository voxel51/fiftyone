import {
  combineSelectionCaptures,
  memberCounts,
  viewConversion,
  type SelectionScope,
} from "@fiftyone/state/src/selection";
import { useEffect, useRef, useState } from "react";

/** Resolve sibling expansion once, then reuse the frozen targets for every action. */
export function useGroupActionScope(
  datasetId: string,
  mediaType: string,
  base: SelectionScope | null,
  view: readonly unknown[],
) {
  const [attempt, setAttempt] = useState(0);
  const [choice, setChoice] = useState<"slice" | "all">("slice");
  const [expanded, setExpanded] = useState<{
    key: string;
    scope: SelectionScope;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify([datasetId, base, view]);
  const frozen = useRef<{
    key: string;
    promise: Promise<SelectionScope>;
  } | null>(null);
  const counts =
    base?.kind === "snapshot"
      ? base.counts
      : base
        ? memberCounts(base.members)
        : null;
  const enabled =
    mediaType === "group" && !viewConversion(view) && !counts?.segments;
  // This effect freezes sibling membership before enabling actions on all slices.
  useEffect(() => {
    if (!enabled || choice !== "all" || !base) return undefined;
    let active = true;
    setError(null);
    if (frozen.current?.key !== key)
      frozen.current = {
        key,
        promise: combineSelectionCaptures(datasetId, {
          view,
          members: base.kind === "members" ? base.members : [],
          snapshotIds: base.kind === "snapshot" ? [base.snapshotId] : [],
          groups: "all",
        }),
      };
    const pending = frozen.current;
    pending.promise
      .then((scope) => {
        if (active)
          setExpanded((current) =>
            current?.key === key ? current : { key, scope },
          );
      })
      .catch((cause: unknown) => {
        if (frozen.current === pending) frozen.current = null;
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [datasetId, enabled, choice, base, view, attempt, key]);
  return {
    enabled,
    choice,
    setChoice,
    scope:
      enabled && choice === "all"
        ? expanded?.key === key
          ? expanded.scope
          : null
        : base,
    error: enabled && choice === "all" ? error : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
