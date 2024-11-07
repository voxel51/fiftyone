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
  a,
  b,
  percentage = false,
  fractionDigits?: number
) {
  if (typeof a === "number" && typeof b === "number") {
    if (percentage) {
      return formatValue(((a - b) / a) * 100, fractionDigits);
    }
    return formatValue(a - b, fractionDigits);
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
