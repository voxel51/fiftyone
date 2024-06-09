import { useRecoilCallback } from "recoil";
import { currentModalSample } from "../recoil";

export default () => {
  return useRecoilCallback(
    ({ set }) =>
      async ({ id }: { id: string }) =>
        set(currentModalSample, { id }),

    []
  );
};
