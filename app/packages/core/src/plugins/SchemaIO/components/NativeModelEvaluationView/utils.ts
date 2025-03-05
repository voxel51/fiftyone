import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { capitalize } from "lodash";
import { useCallback } from "react";

export function useTriggerEvent() {
  const panelId = usePanelId();
  const handleEvent = usePanelEvent();

  const triggerEvent = useCallback(
    (event: string, params?: any, prompt?: boolean) => {
      handleEvent(panelId, { operator: event, params, prompt });
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
  currentType: string
): CompareKey[] {
  return evaluations
    .filter((evaluation) => evaluation.key !== currentName)
    .map((evaluation) => ({
      key: evaluation.key,
      type: evaluation.type,
      method: evaluation.method,
      disabled: evaluation.type !== currentType,
      tooltip: `Evaluation Type: ${capitalize(currentType)}`,
      tooltipBody:
        evaluation.type !== currentType
          ? `Note: Comparisons are only valid between evaluations of the same type.`
          : undefined,
    }))
    .sort((a, b) =>
      a.type === currentType ? -1 : b.type === currentType ? 1 : 0
    );
}
