import { State, fieldPaths } from "@fiftyone/state";
import { DICT_FIELD, VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";
import { useAtomValue } from "jotai";
import { useRecoilValue } from "recoil";
import { activeLabelSchemas } from "./state";

const useSamplePrimitives = (): string[] => {
  const activeFields = useAtomValue(activeLabelSchemas);
  const primitivePaths = useRecoilValue(
    fieldPaths({
      space: State.SPACE.SAMPLE,
      ftype: [...VALID_PRIMITIVE_TYPES, DICT_FIELD],
    })
  );

  if (!activeFields) {
    return [];
  }

  // Show all active primitive fields, even if the sample doesn't
  // have a value yet (e.g. newly created fields via schema manager)
  const validPrimitivePaths = primitivePaths.filter((path) =>
    activeFields.includes(path)
  );

  return validPrimitivePaths;
};

export default useSamplePrimitives;
