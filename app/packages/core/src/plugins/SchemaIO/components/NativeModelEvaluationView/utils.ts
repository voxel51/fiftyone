import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { capitalize } from "lodash";
import { useCallback } from "react";
import { atom } from "recoil";

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
    if (percentage) {
      const percentageDifference = (difference / compareValue) * 100;
      return formatValue(percentageDifference, fractionDigits);
    }
    return formatValue(difference, fractionDigits);
  }
}

export function formatValue(value: string | number, fractionDigits = 3) {
  const numericValue =
    typeof value === "number" ? value : parseFloat(value as string);
  if (!isNaN(numericValue) && numericValue == value) {
    return parseFloat(numericValue.toFixed(fractionDigits));
  }
  return value;
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
  key: "selectedEvalation",
  default: null,
});
