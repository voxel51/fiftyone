import { useRecoilTransaction_UNSTABLE, useRecoilValue } from "recoil";
import { groupField, groupSlice } from "../recoil";

import * as atoms from "../recoil/atoms";

export default (withGroup: boolean = true) => {
  const field = useRecoilValue(groupField);
  return useRecoilTransaction_UNSTABLE(
    ({ set }) =>
      (sample: atoms.SampleData, navigation?: atoms.ModalNavigation) => {
        set(atoms.modal, (current) => {
          return {
            ...sample,
            navigation: navigation ? navigation : current.navigation,
          };
        });

        withGroup && field && set(groupSlice(true), sample.sample[field].name);
      },
    [field, withGroup]
  );
};
