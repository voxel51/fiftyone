import { useRecoilRefresher_UNSTABLE, useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";

export default function useSavedViews() {
  const savedViews = useRecoilValue(fos.savedViewsSelector);
  const refresh = useRecoilRefresher_UNSTABLE(fos.savedViewsSelector);

  return {
    savedViews,
    refresh,
  };
}
