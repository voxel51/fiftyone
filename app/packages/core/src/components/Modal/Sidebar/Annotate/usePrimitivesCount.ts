import { activeModalSidebarSample, fieldPaths, State } from "@fiftyone/state";
import { VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";
import { useSetAtom } from "jotai";
import { get } from "lodash";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { primitivesCount } from "./GroupEntry";

export const usePrimitivesCount = () => {
  const currentSample = useRecoilValue(activeModalSidebarSample);
  const primitivePaths = useRecoilValue(
    fieldPaths({
      space: State.SPACE.SAMPLE,
      ftype: VALID_PRIMITIVE_TYPES,
    })
  );
  const setPrimitivesCount = useSetAtom(primitivesCount);

  useEffect(() => {
    if (!currentSample) {
      setPrimitivesCount(0);
      return;
    }

    let count = 0;
    for (const path of primitivePaths) {
      const value = get(currentSample, path);
      if (value) {
        count++;
      }
    }
    setPrimitivesCount(count);
  }, [currentSample, primitivePaths, setPrimitivesCount]);
};

export default usePrimitivesCount;
