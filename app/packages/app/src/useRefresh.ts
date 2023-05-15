import { selectorWithEffect, subscribe } from "@fiftyone/relay";
import { refresher } from "@fiftyone/state";
import { useRecoilCallback } from "recoil";

export const refreshPage = selectorWithEffect({
  key: "refreshPage",
  get: () => undefined,
  set: true,
});

const useRefresh = () => {
  return useRecoilCallback(
    ({ set }) =>
      () => {
        subscribe((_, { set }) => {
          set(refresher, (cur) => cur + 1);
        });
        set(refreshPage, undefined);
      },
    []
  );
};

export default useRefresh;
