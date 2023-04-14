import { subscribe } from "@fiftyone/relay";
import { refreshPage, refresher } from "@fiftyone/state";
import { useRecoilCallback } from "recoil";

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
