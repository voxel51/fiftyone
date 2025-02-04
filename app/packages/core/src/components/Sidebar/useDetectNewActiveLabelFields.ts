import { activeLabelFields } from "@fiftyone/state";
import { useCallback, useEffect } from "react";
import { useRecoilValue } from "recoil";
import { syncAndGetNewLabels } from "./syncAndGetNewLabels";

export type LookerId = string;
export type CachedLabels = Set<string>;

export const gridActivePathsLUT = new Map<LookerId, CachedLabels>();
export const modalActivePathsLUT = new Map<LookerId, CachedLabels>();

/**
 * Detects newly introduced active label fields for a given looker. Returns a
 * callback that, given a looker ID, merges and returns any fields not yet in
 * the cache. Clears its cache when unmounted.
 *
 * @param modal - Whether this hook is used in a modal context
 * @returns A function that accepts a looker ID and returns newly added fields
 *   or null if there are none
 */
export const useDetectNewActiveLabelFields = ({
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
  }, [modal]);

  return getNewFields;
};
