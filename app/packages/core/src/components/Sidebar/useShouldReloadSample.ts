import { activeLabelFields } from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { syncAndCheckRefreshNeeded } from "./syncAndCheckRefreshNeeded";

export type LookerId = string;
export type CachedLabels = Set<string>;

export const gridActivePathsLUT = new Map<LookerId, CachedLabels>();

export const useShouldReloadSampleOnActiveFieldsChange = ({
  modal,
}: {
  modal: boolean;
}) => {
  const activeLabelFieldsValue = useRecoilValue(activeLabelFields({ modal }));

  const shouldRefresh = useCallback(
    (id: string) => {
      return syncAndCheckRefreshNeeded(
        id,
        gridActivePathsLUT,
        new Set(activeLabelFieldsValue)
      );
    },
    [activeLabelFieldsValue]
  );

  return shouldRefresh;
};
