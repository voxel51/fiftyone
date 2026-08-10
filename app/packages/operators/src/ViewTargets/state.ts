import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { selector, useRecoilValue } from "recoil";
import { ViewTarget } from "../types";

/**
 * Reasons a target cannot be processed, matching the conditions
 * ``ctx.target_view(require_flat=True)`` rejects in
 * ``fiftyone/operators/executor.py``. The wording is written for a radio
 * subtitle rather than reused verbatim from the Python errors.
 */
export const GROUPED_DATASET_TARGET_REASON =
  "Not available for grouped datasets";
export const GROUPED_VIEW_TARGET_REASON =
  "Not available for views that select group slices";

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
  const unflattenedGroupView = useRecoilValue(fos.isUnflattenedGroupView);
  const viewSelectsSlices = useRecoilValue(fos.viewSelectsGroupSlices);

  const isGroupedDataset = isGroup || parentMediaType === "group";

  return {
    isGroupedDataset,
    unflattenedGroupView,
    // a view that selects its own slices is run as-is, so the active slice
    // does not scope it
    scopedToCurrentSlice: isGroupedDataset && !viewSelectsSlices,
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
  const { isGroupedDataset, unflattenedGroupView, scopedToCurrentSlice } =
    useViewTargetConstraints();
  const slice = useRecoilValue(fos.groupSlice);

  return useMemo(() => {
    const resolved = DEFAULT_TARGETS.map((target) => {
      const { label, description } = TARGET_LABELS[target];

      // the whole dataset spans every slice, so only view-based targets are
      // scoped to the active one
      const scoped = scopedToCurrentSlice && target !== ViewTarget.DATASET;

      return {
        target,
        label,
        description: scoped
          ? `${description} in the current slice (${slice})`
          : description,
        unavailableReason:
          target === ViewTarget.DATASET && isGroupedDataset
            ? GROUPED_DATASET_TARGET_REASON
            : target === ViewTarget.CURRENT_VIEW && unflattenedGroupView
              ? GROUPED_VIEW_TARGET_REASON
              : undefined,
      };
    });

    // panels default to the broadest target they can process, unlike
    // ``ViewTargetProperty``, which defaults to the narrowest (``vals[-1]``)
    // so that an active selection wins in an operator form
    const defaultTarget =
      resolved.find((meta) => meta.unavailableReason === undefined)?.target ??
      ViewTarget.DATASET;

    return { targets: resolved, defaultTarget };
  }, [isGroupedDataset, unflattenedGroupView, scopedToCurrentSlice, slice]);
};
