import { useRecoilCallback } from "recoil";
import {
  currentModalNavigation,
  currentModalSample,
  modalSampleIndex,
} from "../recoil";

export default () => {
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (index: number | ((current: number) => number)) => {
        if (index instanceof Function) {
          const current = await snapshot.getPromise(modalSampleIndex);
          index = index(current);
        }
        const getIndex = await snapshot.getPromise(currentModalNavigation);
        const id = await getIndex(index);

        set(currentModalSample, { id, index });
      },
    []
  );
};
