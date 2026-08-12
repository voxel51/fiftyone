import { useMemo } from "react";
import {
  useViewTargetGroupConstraints,
  useViewTargetSampleCounts,
} from "../state";
import { ViewTarget } from "../types";

// the same message ``fiftyone.operators.executor.GROUPED_TARGET_ERROR_MESSAGE``
// resolves into operator forms
export const GROUPED_DATASET_DISABLED_TEXT =
  "Not available for grouped datasets";

export type ViewTargetMeta = {
  target: ViewTarget;
  label: string;
  description: string;
  unavailableReason?: string;
};

// the wording matches the ``ViewTargetProperty`` defaults, which own it for
// operator forms; panels cannot fetch it, so it is repeated here
const DEFAULT_TARGETS = [
  {
    target: ViewTarget.DATASET,
    label: "All samples",
    description: "Process full dataset",
  },
  {
    target: ViewTarget.CURRENT_VIEW,
    label: "Current view",
    description: "Samples matching filters",
  },
  {
    target: ViewTarget.SELECTED_SAMPLES,
    label: "Current selection",
    description: "Selected samples",
  },
];

/**
 * Hook which provides the number of samples each view target processes.
 */
export const useViewTargetCounts = (): Record<ViewTarget, number> => {
  const {
    datasetSampleCount,
    viewSampleCount,
    selectionSampleCount,
    selectionLabelCount,
  } = useViewTargetSampleCounts();

  return useMemo(
    () => ({
      [ViewTarget.DATASET]: datasetSampleCount,
      [ViewTarget.DATASET_VIEW]: datasetSampleCount,
      [ViewTarget.BASE_VIEW]: viewSampleCount,
      [ViewTarget.CURRENT_VIEW]: viewSampleCount,
      [ViewTarget.CUSTOM_VIEW_TARGET]: viewSampleCount,
      [ViewTarget.SELECTED_LABELS]: selectionLabelCount,
      [ViewTarget.SELECTED_SAMPLES]: selectionSampleCount,
    }),
    [
      datasetSampleCount,
      viewSampleCount,
      selectionSampleCount,
      selectionLabelCount,
    ],
  );
};

/**
 * Hook which resolves the view targets an operation may process.
 *
 * ``requireFlat`` mirrors ``ctx.target_view(require_flat=...)``: pass the
 * same value the operation resolves with.
 */
export const useViewTargets = (
  options: { requireFlat?: boolean } = {},
): {
  targets: ViewTargetMeta[];
  defaultTarget: ViewTarget;
} => {
  const { requireFlat = false } = options;
  const { isGroupedDataset, viewIsFlattened, slice } =
    useViewTargetGroupConstraints();

  return useMemo(() => {
    const resolved = DEFAULT_TARGETS.map(({ target, label, description }) => {
      const unavailableReason =
        requireFlat && target === ViewTarget.DATASET && isGroupedDataset
          ? GROUPED_DATASET_DISABLED_TEXT
          : undefined;

      const scope =
        !requireFlat ||
        !isGroupedDataset ||
        unavailableReason ||
        viewIsFlattened
          ? undefined
          : slice
            ? `in the current slice (${slice})`
            : "in the current group slice";

      const scoped = [description, scope].filter(Boolean).join(" ");

      return {
        target,
        label,
        description: [scoped, unavailableReason].filter(Boolean).join(". "),
        unavailableReason,
      };
    });

    const defaultTarget =
      resolved.find((meta) => meta.unavailableReason === undefined)?.target ??
      ViewTarget.DATASET;

    return { targets: resolved, defaultTarget };
  }, [requireFlat, isGroupedDataset, viewIsFlattened, slice]);
};
