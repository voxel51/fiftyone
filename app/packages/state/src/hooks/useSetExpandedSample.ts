import { useRecoilTransaction_UNSTABLE, useRecoilValue } from "recoil";
import { groupField, groupSlice, isGroup } from "../recoil";

import * as atoms from "../recoil/atoms";

export default (withGroup: boolean = true) => {
  const field = useRecoilValue(groupField);
  const group = useRecoilValue(isGroup);
  return useRecoilTransaction_UNSTABLE(
    ({ set }) =>
      (sample: atoms.SampleData, navigation?: atoms.ModalNavigation) => {
        set(atoms.modal, (current) => {
          return {
            ...sample,
            navigation: navigation ? navigation : current.navigation,
          };
        });

        group &&
          withGroup &&
          field &&
          sample.sample[field]?.name &&
          set(groupSlice(true), sample.sample[field]?.name);
      },
    [group, field, withGroup]
  );
};
