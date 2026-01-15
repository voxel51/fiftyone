import { Sample, State, fieldPaths } from "@fiftyone/state";
import { DICT_FIELD, VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";
import { get } from "lodash";
import { useRecoilValue } from "recoil";

const useSamplePrimitives = (currentSample: Sample): string[] => {
  const primitivePaths = useRecoilValue(
    fieldPaths({
      space: State.SPACE.SAMPLE,
      ftype: [...VALID_PRIMITIVE_TYPES, DICT_FIELD],
    })
  );

  // only top level primitives that exist - we want to keep null
  // values it just means the value has not been set yet
  const validPrimitivePaths = primitivePaths.filter(
    (path) => get(currentSample, path) !== undefined
  );

  return validPrimitivePaths;
};

export default useSamplePrimitives;
