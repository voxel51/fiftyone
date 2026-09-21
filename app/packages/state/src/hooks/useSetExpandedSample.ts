import type { ModalSelector } from "../session";

import { useCallback } from "react";
import { useReverbCallback } from "@fiftyone/reverb";
import { modalSelector } from "../atoms";
import * as dynamicGroupAtoms from "../atoms/dynamicGroups";

export default () => {
  const setter = useReverbCallback(
    ({ reset }) =>
      async () => {
        reset(dynamicGroupAtoms.dynamicGroupIndex);
        reset(dynamicGroupAtoms.dynamicGroupCurrentElementIndex);
      },
    [],
  );

  const commit = useReverbCallback(
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
