import { selectorWithEffect, subscribe } from "@fiftyone/relay";
import { useRecoilCallback } from "recoil";
import { refresher } from "../recoil";

export const refresh = selectorWithEffect<undefined>({
  key: "refresh",
  get: () => undefined,
  set: true,
});

const useRefresh = () => {
  return useRecoilCallback(
    ({ set }) =>
      () => {
        const unsubscribe = subscribe((_, { set }) => {
          set(refresher, (cur) => cur + 1);
          unsubscribe();
        });
        set(refresh, undefined);
      },
    []
  );
};

export default useRefresh;
