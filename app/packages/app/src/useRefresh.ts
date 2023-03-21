import { refresher } from "@fiftyone/state";
import { useRecoilTransaction_UNSTABLE } from "recoil";
import { useRouterContext } from "./routing";

const useRefresh = () => {
  const router = useRouterContext();
  return useRecoilTransaction_UNSTABLE(
    ({ set }) =>
      () => {
        router.load(true).then(() => set(refresher, (cur) => cur + 1));
      },
    [router]
  );
};

export default useRefresh;
