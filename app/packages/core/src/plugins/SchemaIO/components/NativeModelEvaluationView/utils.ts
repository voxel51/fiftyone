import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { capitalize } from "lodash";
import { useCallback } from "react";
import { atom } from "recoil";
import { NONE_CLASS } from "./constants";
import { formatValueAsNumber } from "@fiftyone/utilities";

export function useTriggerEvent() {
  const panelId = usePanelId();
  const handleEvent = usePanelEvent();

  const triggerEvent = useCallback(
    (event: string, params?: any, prompt?: boolean, callback?: any) => {
      handleEvent(panelId, {
        operator: event,
        params,
        prompt,
        callback,
      });
    },
    [handleEvent, panelId]
  );

  return triggerEvent;
}

export function getNumericDifference(
  value,
  compareValue,
  percentage = false,
  fractionDigits?: number
) {
  if (typeof value === "number" && typeof compareValue === "number") {
    const difference = value - compareValue;
    const sanitizedCompareValue = compareValue === 0 ? 1 : compareValue;
    if (percentage) {
      const percentageDifference = (difference / sanitizedCompareValue) * 100;
      return formatValueAsNumber(percentageDifference, fractionDigits);
    }
    return formatValueAsNumber(difference, fractionDigits);
  }
}

export function getMatrix(
  matrices,
  config,
  maskTargets?,
  compareMaskTargets?,
  plot?
) {
  if (!matrices) return;
  const { sortBy = "az", limit } = config;
  const parsedLimit = typeof limit === "number" ? limit : undefined;
  const originalClasses = matrices[`${sortBy}_classes`];
  const originalMatrix = matrices[`${sortBy}_matrix`];
  const originalColorscale = matrices[`${sortBy}_colorscale`];
  const chosenClasses = config?.classes;
  const hasChosenClasses =
    Array.isArray(chosenClasses) && chosenClasses?.length;
  let classes = originalClasses;
  let matrix = originalMatrix;
  let colorscale = originalColorscale;
  if (hasChosenClasses) {
    const classIndices = chosenClasses.map((c) => originalClasses.indexOf(c));
    classes = chosenClasses;
    matrix = classIndices.map((i) => {
      return classIndices.map((j) => {
        return originalMatrix[i][j];
      });
    });
    if (Array.isArray(colorscale)) {
      colorscale = classIndices.map((i) => originalColorscale[i]);
    }
  } else if (parsedLimit) {
    classes = originalClasses.slice(0, parsedLimit);
    matrix = originalMatrix.slice(0, parsedLimit);
    if (Array.isArray(colorscale)) {
      colorscale = colorscale.slice(0, parsedLimit);
    }
  }
  const labels = classes.map((c) => {
    return compareMaskTargets?.[c] || maskTargets?.[c] || c;
  });
  if (!hasChosenClasses) {
    const noneIndex = originalClasses.indexOf(NONE_CLASS);
    if (parsedLimit && parsedLimit < originalClasses.length && noneIndex > -1) {
      labels.push(
        compareMaskTargets?.[NONE_CLASS] ||
          maskTargets?.[NONE_CLASS] ||
          NONE_CLASS
      );
      matrix.push(originalMatrix[noneIndex]);
    }
  }

  const baseMatrix = { labels, matrix, colorscale };

  if (plot) {
    return {
      ...baseMatrix,
      plot: {
        z: matrix,
        x: labels,
        y: labels,
        type: "heatmap",
        colorscale: config?.log ? colorscale || "viridis" : "viridis",
        hovertemplate:
          [
            "<b>count: %{z:d}</b>",
            `${config?.gt_field || "truth"}: %{y}`,
            `${config?.pred_field || "predicted"}: %{x}`,
          ].join(" <br>") + "<extra></extra>",
      },
    };
  }

  return baseMatrix;
}

export function getClasses(matrices, maskTargets?) {
  const sortBy = "az";
  const classes = matrices[`${sortBy}_classes`];
  return classes.map((c) => {
    return maskTargets?.[c] || c;
  });
}

export interface CompareKey {
  key: string;
  type: string;
  method: string;
  disabled: boolean;
  tooltip: string;
  tooltipBody: string;
}

export function computeSortedCompareKeys(
  evaluations: any[],
  currentName: string,
  currentType: string,
  currentMethod: string
): CompareKey[] {
  return evaluations
    .filter((evaluation) => evaluation.key !== currentName)
    .map((evaluation) => ({
      key: evaluation.key,
      type: evaluation.type,
      method: evaluation.method,
      disabled: !(
        evaluation.type === currentType && evaluation.method === currentMethod
      ),
      tooltip: `Evaluation Type: ${capitalize(currentType)}`,
      tooltipBody: !(
        evaluation.type === currentType && evaluation.method === currentMethod
      )
        ? `Note: Comparisons are only valid between evaluations of the same type and method.`
        : undefined,
    }))
    .sort((a, b) => {
      // First, non-disabled items come first
      if (a.disabled !== b.disabled) {
        return a.disabled ? 1 : -1;
      }
      // Next, items with type equal to currentType come first
      if ((a.type === currentType) !== (b.type === currentType)) {
        return a.type === currentType ? -1 : 1;
      }
      // Finally, sort alphabetically by key to ensure deterministic order
      return a.key.localeCompare(b.key);
    });
}

/**
 * Atom state to control the visibility of the delete evaluation dialog
 */
export const openModelEvalDialog = atom<boolean>({
  key: "openModelEvalDialog",
  default: false,
});

/**
 * Atom state to store the currently selected model evaluation key to act on.
 * Contains the name and id of the selected evaluation.
 */
export const selectedModelEvaluation = atom<string | null>({
  key: "selectedModelEvaluation",
  default: null,
});
