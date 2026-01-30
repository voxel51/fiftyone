import { useSampleMutationManager } from "@fiftyone/annotation";
import { Primitive } from "@fiftyone/utilities";
import { Button, Orientation, Stack, Variant } from "@voxel51/voodo";
import { useCallback, useEffect, useRef, useState } from "react";
import { generatePrimitiveSchema, PrimitiveSchema } from "./schemaHelpers";
import PrimitiveRenderer from "./PrimitiveRenderer";
import { parseDatabaseValue, serializeFieldValue } from "./serialization";
import {
  DelegatingUndoable,
  KnownContexts,
  useCreateCommand,
} from "@fiftyone/commands";

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

      return new DelegatingUndoable(
        `primitive-edit-${path}-action`,
        // stage mutation on execute
        () => {
          try {
            const serializedValue = serializeFieldValue(newValue, type);
            sampleMutationManager.stageMutation(path, serializedValue);
          } catch (err) {
            console.warn("unparseable value", newValue);
          }
        },
        // restore original value on undo
        () => {
          sampleMutationManager.stageMutation(path, oldValue);
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

  const onExit = useExit();

  const handleSave = useCallback(() => {
    onExit();
  }, [onExit]);

  return (
    <Stack orientation={Orientation.Column}>
      <PrimitiveRenderer
        type={type}
        fieldValue={fieldValue}
        handleChange={handleChange}
        primitiveSchema={primitiveSchema}
      />
      <Stack
        orientation={Orientation.Row}
        style={{
          justifyContent: "flex-end",
          gap: "0.5rem",
          marginTop: "0.5rem",
        }}
      >
        <Button variant={Variant.Secondary} onClick={onExit}>
          Discard
        </Button>
        <Button onClick={handleSave}>Save</Button>
      </Stack>
    </Stack>
  );
}
