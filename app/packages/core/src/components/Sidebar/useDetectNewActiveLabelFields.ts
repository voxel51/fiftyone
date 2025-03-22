import { subscribe } from "@fiftyone/relay";
import { activeLabelFields } from "@fiftyone/state";
import { useCallback, useEffect } from "react";
import { useRecoilValue } from "recoil";
import { syncAndGetNewLabels } from "./syncAndGetNewLabels";

export type LookerId = string;
export type CachedLabels = Set<string>;

export const gridActivePathsLUT = new Map<LookerId, CachedLabels>();
export const modalActivePathsLUT = new Map<LookerId, CachedLabels>();

const clear = (modal: boolean) =>
  modal ? modalActivePathsLUT.clear() : gridActivePathsLUT.clear();

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

  // reset for page transitions
  useEffect(() => subscribe(() => clear(modal)), [modal]);

  const getNewFields = useCallback(
    (id: string) => {
      return syncAndGetNewLabels(
        id,
        modal ? modalActivePathsLUT : gridActivePathsLUT,
        new Set(activeLabelFieldsValue)
      );
    },
    [activeLabelFieldsValue, modal]
  );

  const getExistingFields = useCallback(
    (id: string) => {
      const mayBeFields = modal
        ? modalActivePathsLUT.get(id)
        : gridActivePathsLUT.get(id);
      return mayBeFields ? Array.from(mayBeFields) : [];
    },
    [modal]
  );

  const removeField = useCallback(
    (id: string) => {
      if (modal) {
        modalActivePathsLUT.delete(id);
      } else {
        gridActivePathsLUT.delete(id);
      }
    },
    [modal]
  );

  const reset = useCallback(() => {
    if (modal) {
      modalActivePathsLUT.clear();
    } else {
      gridActivePathsLUT.clear();
    }
  }, [modal]);

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

  return { getNewFields, getExistingFields, removeField, reset };
};
