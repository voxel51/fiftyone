import { useRecoilCallback } from "recoil";

import * as atoms from "../recoil/atoms";

export default () => {
  return useRecoilCallback(
    ({ set }) =>
      (sample: atoms.SampleData, navigation?: atoms.ModalNavigation) => {
        sample &&
          set(atoms.modal, (current) => {
            return {
              ...sample,
              navigation: navigation ? navigation : current.navigation,
            };
          });
      },
    []
  );
};
