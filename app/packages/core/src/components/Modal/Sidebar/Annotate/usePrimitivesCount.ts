import { useModalSample } from "@fiftyone/state";
import { useEffect } from "react";
import { useSetPrimitivesCount } from "./redux/hooks";
import useSamplePrimitives from "./useSamplePrimitives";

export const usePrimitivesCount = () => {
  const currentSample = useModalSample()?.sample;
  const samplePrimitives = useSamplePrimitives();
  const setPrimitivesCount = useSetPrimitivesCount();

  useEffect(() => {
    if (!currentSample) {
      setPrimitivesCount(0);
      return;
    }
    setPrimitivesCount(samplePrimitives.length);
  }, [currentSample, samplePrimitives, setPrimitivesCount]);
};

export default usePrimitivesCount;
