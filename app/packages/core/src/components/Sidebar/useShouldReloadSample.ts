import { activeLabelFields } from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";

type LookerId = string;
type CachedLabels = Set<string>;

export const gridActivePathsLUT = new Map<LookerId, CachedLabels>();

export const useShouldReloadSampleOnActiveFieldsChange = ({
  modal,
}: {
  modal: boolean;
}) => {
  const activeLabelFieldsValue = useRecoilValue(activeLabelFields({ modal }));

  const shouldRefresh = useCallback(
    (id: string) => {
      const thisLookerActiveFields = gridActivePathsLUT.get(id);
      const currentActiveLabelFields = new Set(activeLabelFieldsValue);

      if (currentActiveLabelFields.size === 0) {
        return false;
      }

      // diff the two sets, we only care about net new fields
      // if there are no new fields, we don't need to update the tracker
      let hasNewFields = false;

      if (thisLookerActiveFields) {
        for (const field of currentActiveLabelFields) {
          if (!thisLookerActiveFields.has(field)) {
            hasNewFields = true;
            break;
          }
        }
      } else {
        hasNewFields = true;
      }

      if (!hasNewFields) {
        return false;
      }

      gridActivePathsLUT.set(
        id,
        new Set([
          ...(thisLookerActiveFields ?? []),
          ...currentActiveLabelFields,
        ])
      );

      return true;
    },
    [activeLabelFieldsValue]
  );

  return shouldRefresh;
};
