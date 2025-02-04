import { activeLabelFields } from "@fiftyone/state";
import { useCallback, useEffect } from "react";
import { useRecoilValue } from "recoil";
import { syncAndGetNewLabels } from "./syncAndGetNewLabels";

export type LookerId = string;
export type CachedLabels = Set<string>;

export const gridActivePathsLUT = new Map<LookerId, CachedLabels>();
export const modalActivePathsLUT = new Map<LookerId, CachedLabels>();

export const useShouldReloadSampleOnActiveFieldsChange = ({
  modal,
}: {
  modal: boolean;
}) => {
  const activeLabelFieldsValue = useRecoilValue(activeLabelFields({ modal }));

  const getNewFields = useCallback(
    (id: string) => {
      return syncAndGetNewLabels(
        id,
        modal ? modalActivePathsLUT : gridActivePathsLUT,
        new Set(activeLabelFieldsValue)
      );
    },
    [activeLabelFieldsValue]
  );

  /**
   * clear look up table when component unmounts
   */
  useEffect(() => {
    return () => {
      if (modal) {
        modalActivePathsLUT.clear();
      } else {
        gridActivePathsLUT.clear();
      }
    };
  }, []);

  return getNewFields;
};
