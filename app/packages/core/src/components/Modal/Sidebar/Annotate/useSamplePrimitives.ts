import { State, activeModalSidebarSample, fieldPaths } from "@fiftyone/state";
import { DICT_FIELD, VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";
import { useRecoilValue } from "recoil";

const useSamplePrimitives = (): string[] => {
  const currentSample = useRecoilValue(activeModalSidebarSample);
  const primitivePaths = useRecoilValue(
    fieldPaths({
      space: State.SPACE.SAMPLE,
      ftype: [...VALID_PRIMITIVE_TYPES, DICT_FIELD],
    })
  );

  console.log("primitivePaths", primitivePaths);
  console.log("currentSample", currentSample);

  // only top level primitives that exist - we want to keep null
  // values it just means the value has not been set yet
  const validPrimtitivePaths = primitivePaths.filter(
    (path) => currentSample[path] !== undefined
  );

  return validPrimtitivePaths;
};

export default useSamplePrimitives;
