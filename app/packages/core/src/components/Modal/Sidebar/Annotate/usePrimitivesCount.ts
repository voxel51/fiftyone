import { modalSample } from "@fiftyone/state";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { primitivesCount } from "./GroupEntry";
import useSamplePrimitives from "./useSamplePrimitives";

export const usePrimitivesCount = () => {
  const currentSample = useRecoilValue(modalSample).sample;
  const samplePrimitives = useSamplePrimitives();
  const setPrimitivesCount = useSetAtom(primitivesCount);

  useEffect(() => {
    if (!currentSample) {
      setPrimitivesCount(0);
      return;
    }
    setPrimitivesCount(samplePrimitives.length);
  }, [currentSample, samplePrimitives, setPrimitivesCount]);
};

export default usePrimitivesCount;
