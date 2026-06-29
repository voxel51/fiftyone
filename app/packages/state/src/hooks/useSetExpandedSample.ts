import type { ModalSelector } from "../session";

import { useCallback } from "react";
import { useRecoilCallback } from "recoil";
import { modalSelector } from "../recoil";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";

export default () => {
  const setter = useRecoilCallback(
    ({ reset }) =>
      async () => {
        reset(dynamicGroupAtoms.dynamicGroupIndex);
        reset(dynamicGroupAtoms.dynamicGroupCurrentElementIndex);
      },
    [],
  );

  const commit = useRecoilCallback(
    ({ set }) =>
      async (selector: ModalSelector) => {
        set(modalSelector, selector);
      },
    [],
  );

  return useCallback(
    async (selector?: ModalSelector) => {
      await setter();
      selector && commit(selector);
    },
    [commit, setter],
  );
};
