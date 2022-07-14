import { useRecoilCallback } from "recoil";

import * as atoms from "../recoil/atoms";

export default () => {
  return useRecoilCallback(
    ({ set }) =>
      (sample: atoms.SampleData, navigation: atoms.ModalNavigation) => {
        sample &&
          set(atoms.modal, {
            ...sample,
            navigation,
          });
      },
    []
  );
};
