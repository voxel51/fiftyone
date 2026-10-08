import { useCallback } from "react";
import { useReverbState, useReverbValue } from "@fiftyone/reverb";
import {
  canToggleShownLabelAttributes,
  labelAttributeRow,
  shownLabelAttributes,
  toggleShownLabelAttribute,
} from "../atoms/labelAttributes";

/**
 * Show/hide state for a sidebar label attribute row, e.g.
 * "ground_truth.detections.label". Returns null when the row is not a label
 * attribute or toggling it would not change what is rendered.
 */
export default function useLabelAttributeToggle(path: string, modal: boolean) {
  const row = useReverbValue(labelAttributeRow(path));
  const eligible = useReverbValue(
    canToggleShownLabelAttributes({ path: row?.labelPath ?? "", modal }),
  );
  const [shown, setShown] = useReverbState(
    shownLabelAttributes(row?.labelPath ?? ""),
  );

  const attribute = row?.attribute;
  const toggle = useCallback(() => {
    attribute && setShown(toggleShownLabelAttribute(shown, attribute));
  }, [attribute, setShown, shown]);

  if (!row || !eligible) {
    return null;
  }

  return {
    attribute: row.attribute,
    isShown: shown.includes(row.attribute),
    toggle,
  };
}
