import { activeLabelFields } from "@fiftyone/state";
import { useEffect, useRef } from "react";
import { atomFamily, useRecoilState, useRecoilValue } from "recoil";
import { gridPage } from "../Grid/recoil";

const labelsToggleTracker = atomFamily<Map<number, Set<string>>, boolean>({
  key: "labelsToggleTracker",
  default: new Map<number, Set<string>>(),
});

/**
 * This hook is used to update the sidebar tracker when the user changes the
 * selection of labels in the sidebar. We keep a map of grid page to the active
 * label fields for that page.
 */
export const useOnSidebarSelectionChange = ({ modal }: { modal: boolean }) => {
  const activeLabelFieldsValue = useRecoilValue(activeLabelFields({ modal }));
  const gridPageValue = useRecoilValue(gridPage);

  const gridPageValueRef = useRef(gridPageValue);

  gridPageValueRef.current = gridPageValue;

  const [sidebarTracker, setSidebarTracker] = useRecoilState(
    labelsToggleTracker(modal)
  );

  useEffect(() => {
    const thisPageActiveFields = sidebarTracker.get(gridPageValue);

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
      ...sidebarTracker,
      [gridPageValueRef.current, new Set(activeLabelFieldsValue)],
    ]);

    if (newTracker.size === 0) {
      return;
    }

    setSidebarTracker(newTracker);
  }, [activeLabelFieldsValue, sidebarTracker]);

  return sidebarTracker;
};
