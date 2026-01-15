import { Text, TextVariant } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import useLabelSchema from "../SchemaManager/EditFieldLabelSchema/useLabelSchema";
import PrimitiveEdit from "./PrimitiveEdit";
import { primitivePath } from "./state";

export function PrimitiveWrapper() {
  const path = useAtomValue(primitivePath);
  const { currentLabelSchema } = useLabelSchema(path ?? "");
  if (!path) {
    return <Text variant={TextVariant.Label}>Could not determine path</Text>;
  }
  if (!currentLabelSchema) {
    return (
      <Text variant={TextVariant.Label}>Could not determine label schema</Text>
    );
  }
  return <PrimitiveEdit path={path} currentLabelSchema={currentLabelSchema} />;
}

export default PrimitiveWrapper;
