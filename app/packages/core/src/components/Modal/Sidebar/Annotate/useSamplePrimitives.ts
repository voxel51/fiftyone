import { usePrimitiveFieldPaths } from "@fiftyone/state";
import { useAtomValue } from "jotai";
import { activeLabelSchemas } from "./state";

const useSamplePrimitives = (): string[] => {
  const activeFields = useAtomValue(activeLabelSchemas);
  // both spaces: a video's `frames.*` primitives list alongside the sample's
  const primitivePaths = usePrimitiveFieldPaths();

  if (!activeFields) {
    return [];
  }

  return primitivePaths.filter((path) => activeFields.includes(path));
};

export default useSamplePrimitives;
