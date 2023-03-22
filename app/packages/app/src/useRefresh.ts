import { refresher } from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilTransaction_UNSTABLE } from "recoil";
import { useRouterContext } from "./routing";

const useRefresh = () => {
  const router = useRouterContext();
  const setter = useRecoilTransaction_UNSTABLE(
    ({ set }) =>
      () =>
        set(refresher, (cur) => cur + 1),
    []
  );

  return useCallback(() => router.load(true).then(setter), [router, setter]);
};

export default useRefresh;
