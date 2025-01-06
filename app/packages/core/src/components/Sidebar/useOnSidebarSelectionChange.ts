import { activeLabelFields, labelsToggleTracker } from "@fiftyone/state";
import { useEffect, useRef } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { gridPage } from "../Grid/recoil";

/**
 * This hook is used to update the sidebar tracker when the user changes the
 * selection of labels in the sidebar. We keep a map of grid page to the active
 * label fields for that page.
 */
export const useOnSidebarSelectionChange = () => {
  const activeLabelFieldsValue = useRecoilValue(
    activeLabelFields({ modal: false })
  );
  const gridPageValue = useRecoilValue(gridPage);

  const gridPageValueRef = useRef(gridPageValue);

  gridPageValueRef.current = gridPageValue;

  const setSidebarTracker = useSetRecoilState(labelsToggleTracker);

  const debugSidebarTracker = useRecoilValue(labelsToggleTracker);

  useEffect(() => {
    const thisPageActiveFields = debugSidebarTracker.get(gridPageValue);

    const currentActiveLabelFields = new Set(activeLabelFieldsValue);

    if (currentActiveLabelFields.size === 0) {
      return;
    }

    // diff the two sets, we only care about net new fields
    // if there are no new fields, we don't need to update the tracker
    let hasNewFields = false;
    if (thisPageActiveFields) {
      for (const field of currentActiveLabelFields) {
        if (!thisPageActiveFields.has(field)) {
          hasNewFields = true;
          break;
        }
      }
    } else {
      hasNewFields = true;
    }

    if (!hasNewFields) {
      return;
    }

    const newTracker = new Map([
      ...debugSidebarTracker,
      [gridPageValueRef.current, new Set(activeLabelFieldsValue)],
    ]);

    if (newTracker.size === 0) {
      return;
    }

    setSidebarTracker(newTracker);
  }, [activeLabelFieldsValue, debugSidebarTracker]);
};
