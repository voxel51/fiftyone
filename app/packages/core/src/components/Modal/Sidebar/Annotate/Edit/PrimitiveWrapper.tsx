import { Text, TextVariant } from "@voxel51/voodo";
import useLabelSchema from "../SchemaManager/EditFieldLabelSchema/useLabelSchema";
import PrimitiveEdit from "./PrimitiveEdit";
import useActivePrimitive from "./useActivePrimitive";

export function PrimitiveWrapper() {
  const [activePrimitivePath] = useActivePrimitive();
  const { currentLabelSchema } = useLabelSchema(activePrimitivePath ?? "");
  if (!activePrimitivePath) {
    return <Text variant={TextVariant.Label}>Could not determine path</Text>;
  }
  if (!currentLabelSchema) {
    return (
      <Text variant={TextVariant.Label}>Could not determine label schema</Text>
    );
  }
  return (
    <PrimitiveEdit
      path={activePrimitivePath}
      currentLabelSchema={currentLabelSchema}
    />
  );
}

export default PrimitiveWrapper;
