import { useCallback } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import {
  canToggleShownLabelAttributes,
  labelAttributeRow,
  shownLabelAttributes,
  toggleShownLabelAttribute,
} from "../recoil/labelAttributes";

/**
 * Show/hide state for a sidebar label attribute row, e.g.
 * "ground_truth.detections.label". Returns null when the row is not a label
 * attribute or toggling it would not change what is rendered.
 */
export default function useLabelAttributeToggle(path: string, modal: boolean) {
  const row = useRecoilValue(labelAttributeRow(path));
  const eligible = useRecoilValue(
    canToggleShownLabelAttributes({ path: row?.labelPath ?? "", modal }),
  );
  const [shown, setShown] = useRecoilState(
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
