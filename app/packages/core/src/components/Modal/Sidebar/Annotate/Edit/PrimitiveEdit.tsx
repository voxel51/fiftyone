import {
  SampleMutationManager,
  useSampleMutationManager,
} from "@fiftyone/annotation";
import {
  DelegatingUndoable,
  KnownContexts,
  useCreateCommand,
} from "@fiftyone/commands";
import { isNullish, Primitive } from "@fiftyone/utilities";
import { Orientation, Stack } from "@voxel51/voodo";
import { useCallback, useEffect, useRef, useState } from "react";
import PrimitiveRenderer from "./PrimitiveRenderer";
import { generatePrimitiveSchema, PrimitiveSchema } from "./schemaHelpers";
import {
  parseDatabaseValue,
  serializeDatabaseDateValue,
  serializeFieldValue,
} from "./serialization";

interface PrimitiveEditProps {
  path: string;
  currentLabelSchema: PrimitiveSchema;
}

export default function PrimitiveEdit({
  path,
  currentLabelSchema,
}: PrimitiveEditProps) {
  const { type } = currentLabelSchema;

  const sampleMutationManager = useSampleMutationManager();
  const value = sampleMutationManager.getPathValue(path);

  const primitiveSchema = generatePrimitiveSchema(path, currentLabelSchema);

  const [fieldValue, setFieldValue] = useState<Primitive | Date>(
    parseDatabaseValue(type, value)
  );

  // synchronize external value changes with field
  useEffect(
    () => setFieldValue(parseDatabaseValue(type, value)),
    [type, value]
  );

  // need to use a ref to access field value in command callback;
  // command will run before the next render loop when `fieldValue` is updated.
  const transientFieldValue = useRef<Primitive>(fieldValue as Primitive);

  // undoable command which handles primitive edits
  const editCommand = useCreateCommand(
    KnownContexts.ModalAnnotate,
    `primitive-edit-${path}`,
    useCallback(() => {
      const oldValue = value;
      const newValue = transientFieldValue.current;
      const isAddOperation = isAdd(path, sampleMutationManager);

      return new DelegatingUndoable(
        `primitive-edit-${path}-action`,
        // stage mutation on execute
        () => {
          try {
            const serializedValue = serializeFieldValue(newValue, type);
            let op = "mutate";
            if (isAddOperation) {
              op = "add";
            } else if (isNullish(serializedValue) || serializedValue === "") {
              op = "delete";
            }
            sampleMutationManager.stageMutation(path, {
              data: serializedValue,
              op,
            });
          } catch (err) {
            console.warn("unparseable value", newValue);
          }
        },
        // restore original value on undo
        () => {
          const hasOldValue = !isNullish(oldValue);
          let oldValueSerialized = oldValue;
          if (type === "date" || type === "datetime") {
            oldValueSerialized = serializeDatabaseDateValue(
              oldValue as { datetime: number }
            );
          }

          sampleMutationManager.stageMutation(path, {
            data: oldValueSerialized,
            op: isAddOperation && !hasOldValue ? "delete" : "mutate",
          });
        }
      );
    }, [path, sampleMutationManager, type, value]),
    () => true
  );

  const handleChange = useCallback(
    (data: unknown) => {
      transientFieldValue.current = data as Primitive;
      setFieldValue(data as Primitive);

      if (editCommand.enabled) {
        editCommand.callback();
      }
    },
    [editCommand]
  );

  return (
    <Stack orientation={Orientation.Column}>
      <PrimitiveRenderer
        type={type}
        fieldValue={fieldValue}
        handleChange={handleChange}
        primitiveSchema={primitiveSchema}
      />
    </Stack>
  );
}

function isAdd(path: string, sampleMutationManager: SampleMutationManager) {
  if (!path.includes(".")) return false;
  const parentPath = path.split(".").slice(0, -1).join(".");
  const parentValue = sampleMutationManager.getPathValue(parentPath);
  return isNullish(parentValue);
}
