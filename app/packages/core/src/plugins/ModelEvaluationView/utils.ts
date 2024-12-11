import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
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
  if (!isNaN(numericValue)) {
    return parseFloat(numericValue.toFixed(fractionDigits));
  }
  return value;
}
