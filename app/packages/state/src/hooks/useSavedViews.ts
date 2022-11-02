import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";

export default function useSavedViews() {
  const savedViews = useRecoilValue(fos.savedViewsSelector);

  return {
    savedViews,
  };
}
