import { selectorWithEffect, subscribe } from "@fiftyone/relay";
import { useReverbCallback } from "@fiftyone/reverb";
import { refresher } from "../atoms";

export const refresh = selectorWithEffect<undefined>({
  key: "refresh",
  get: () => undefined,
  set: true,
});

const useRefresh = () => {
  return useReverbCallback(
    ({ set }) =>
      () => {
        const unsubscribe = subscribe((_, { set }) => {
          set(refresher, (cur) => cur + 1);
          unsubscribe();
        });
        set(refresh, undefined);
      },
    [],
  );
};

export default useRefresh;
