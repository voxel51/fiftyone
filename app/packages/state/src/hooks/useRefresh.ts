import { useRecoilCallback } from "recoil";
import { refresher } from "../recoil";

const useRefresh = () => {
  return useRecoilCallback(
    ({ set }) =>
      () => {
        set(refresher, (cur) => cur + 1);
      },
    []
  );
};

export default useRefresh;
