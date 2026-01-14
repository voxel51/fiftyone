import { Text, TextVariant } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import PrimitiveEdit from "./PrimitiveEdit";
import { primitivePath } from "./state";

export function PrimitiveWrapper() {
  const path = useAtomValue(primitivePath);
  if (!path) {
    return <Text variant={TextVariant.Label}>Could not determine path</Text>;
  }
  return <PrimitiveEdit path={path} />;
}

export default PrimitiveWrapper;
