import { State, fieldPaths } from "@fiftyone/state";
import { DICT_FIELD, VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";
import { useRecoilValue } from "recoil";
import { useActiveSchemas } from "./redux/hooks";

const useSamplePrimitives = (): string[] => {
  const activeFields = useActiveSchemas();
  const primitivePaths = useRecoilValue(
    fieldPaths({
      space: State.SPACE.SAMPLE,
      ftype: [...VALID_PRIMITIVE_TYPES, DICT_FIELD],
    })
  );

  if (!activeFields) {
    return [];
  }

  const validPrimitivePaths = primitivePaths.filter((path) =>
    activeFields.includes(path)
  );

  return validPrimitivePaths;
};

export default useSamplePrimitives;
