import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { selector, useRecoilValue } from "recoil";
import { ViewTarget } from "../types";

/**
 * Reason a target cannot be processed, matching the condition
 * ``ctx.target_view(require_flat=True)`` rejects in
 * ``fiftyone/operators/executor.py``. The wording is written for a radio
 * subtitle rather than reused verbatim from the Python error.
 */
export const GROUPED_DATASET_TARGET_REASON =
  "Not available for grouped datasets";
/**
 * A view target offered to the user.
 */
export type ViewTargetMeta = {
  target: ViewTarget;
  label: string;
  description: string;
  // set when the operation cannot process this target
  unavailableReason?: string;
};

const TARGET_LABELS: Record<string, { label: string; description: string }> = {
  [ViewTarget.DATASET]: {
    label: "All samples",
    description: "Process full dataset",
  },
  [ViewTarget.CURRENT_VIEW]: {
    label: "Current view",
    description: "Samples matching filters",
  },
  [ViewTarget.SELECTED_SAMPLES]: {
    label: "Current selection",
    description: "Selected samples",
  },
};

const DEFAULT_TARGETS = [
  ViewTarget.DATASET,
  ViewTarget.CURRENT_VIEW,
  ViewTarget.SELECTED_SAMPLES,
];

// for grouped datasets, runs process the active slice, but the shared count()
// selector's query-performance shortcut reports the all-slices dataset count,
// so read the slice-scoped root aggregation count instead
const currentViewSampleCount = selector<number>({
  key: "viewTargetCurrentViewSampleCount",
  get: ({ get }) => {
    // a view that selects its own slices is run as-is, so it is counted like
    // any other flattened view
    if (get(fos.hasGroupSlices) && !get(fos.viewSelectsGroupSlices)) {
      const data = get(
        fos.aggregation({ path: "", extended: true, modal: false }),
      );

      if (data?.__typename !== "RootAggregation") {
        return 0;
      }

      // with group statistics the aggregation spans every slice, so read the
      // active-slice count that the run will actually process
      return (
        (get(fos.groupStatistics(false)) === "group"
          ? data.slice
          : data.count) ?? 0
      );
    }

    return get(fos.count({ path: "", extended: true, modal: false })) ?? 0;
  },
});

/**
 * Hook which provides a getter for the number of samples in a view target.
 */
export const useGetViewTargetCount = (): ((target: ViewTarget) => number) => {
  const datasetSampleCount = useRecoilValue(fos.datasetSampleCount);
  const viewSampleCount = useRecoilValue(currentViewSampleCount);
  const selectionSampleCount = useRecoilValue(fos.selectedSamples)?.size ?? 0;

  return useCallback(
    (target: ViewTarget) => {
      switch (target) {
        case ViewTarget.DATASET:
        case ViewTarget.DATASET_VIEW:
          return datasetSampleCount ?? 0;
        case ViewTarget.SELECTED_SAMPLES:
          return selectionSampleCount;
        default:
          // scoped to the active slice, which is what the run processes once
          // select_group_slices is applied
          return viewSampleCount ?? 0;
      }
    },
    [datasetSampleCount, viewSampleCount, selectionSampleCount],
  );
};

/**
 * Constraints that grouped datasets and grouped views impose on view targets.
 */
const useViewTargetConstraints = () => {
  // grouped datasets are processed per slice, so the full dataset is not a
  // valid target, even when a flattened view is loaded
  const isGroup = useRecoilValue(fos.isGroup);
  const parentMediaType = useRecoilValue(fos.parentMediaTypeSelector);
  const viewSelectsSlices = useRecoilValue(fos.viewSelectsGroupSlices);

  const isGroupedDataset = isGroup || parentMediaType === "group";

  return {
    isGroupedDataset,
    // a view that selects its own slices is run as-is, so the active slice
    // does not scope it
    viewSelectsSlices,
  };
};

/**
 * Hook which resolves the view targets an operation may process.
 *
 * Resolved from app state so that the selector tracks the view, the active
 * slice and the selection synchronously. The same rules are enforced by
 * `ctx.target_view(require_flat=True)`, which rejects targets it cannot
 * flatten, so an operation can never process a target reported as
 * unavailable here.
 */
export const useViewTargets = (): {
  targets: ViewTargetMeta[];
  defaultTarget: ViewTarget;
} => {
  const { isGroupedDataset, viewSelectsSlices } = useViewTargetConstraints();
  const slice = useRecoilValue(fos.groupSlice);

  return useMemo(() => {
    const resolved = DEFAULT_TARGETS.map((target) => {
      const { label, description } = TARGET_LABELS[target];

      const unavailableReason =
        target === ViewTarget.DATASET && isGroupedDataset
          ? GROUPED_DATASET_TARGET_REASON
          : undefined;

      // for grouped datasets the subtext names the slices the run will
      // process: the ones the view already selects, or the active slice that
      // select_group_slices appends. An unavailable target names none,
      // because it processes nothing
      const scope =
        !isGroupedDataset || unavailableReason
          ? undefined
          : viewSelectsSlices
            ? "in the group slices this view selects"
            : slice
              ? `in the current slice (${slice})`
              : "in the current group slice";

      // the subtext states the slice scope the target resolves to, plus the
      // reason it cannot be used when it is disabled
      const scoped = [description, scope].filter(Boolean).join(" ");

      return {
        target,
        label,
        description: [scoped, unavailableReason].filter(Boolean).join(". "),
        unavailableReason,
      };
    });

    // panels default to the broadest target they can process, unlike
    // ``ViewTargetProperty``, which defaults to the narrowest (``vals[-1]``)
    // so that an active selection wins in an operator form
    const defaultTarget =
      resolved.find((meta) => meta.unavailableReason === undefined)?.target ??
      ViewTarget.DATASET;

    return { targets: resolved, defaultTarget };
  }, [isGroupedDataset, viewSelectsSlices, slice]);
};
