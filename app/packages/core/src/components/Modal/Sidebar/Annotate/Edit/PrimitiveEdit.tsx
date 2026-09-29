import {
  useActiveSampleId,
  useAnnotationEngine,
  useSampleInstance,
  useSampleSelector,
} from "@fiftyone/annotation";
import {
  DelegatingUndoable,
  KnownContexts,
  useCreateCommand,
} from "@fiftyone/commands";
import { isNullish, Primitive, Sample } from "@fiftyone/utilities";
import { Orientation, Stack } from "@voxel51/voodo";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useFramePrimitiveValue,
  useIsFramePrimitive,
  usePlayheadFrame,
} from "../useFramePrimitive";
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

  const sample = useSampleInstance();
  const sampleId = useActiveSampleId();
  const engine = useAnnotationEngine();

  // in a dynamic group played as video each frame is its own member sample, so
  // a frame-scoped primitive reads and writes at the playhead, not the anchor
  const isFramePrimitive = useIsFramePrimitive(path);
  const frame = usePlayheadFrame();
  const framePrimitive = useFramePrimitiveValue(path);
  const samplePrimitive = useSampleSelector((s) =>
    s.getResolved<Primitive>(path),
  );
  const value = isFramePrimitive ? framePrimitive : samplePrimitive;

  const writeField = useCallback(
    (next: unknown) => {
      if (!isFramePrimitive) {
        sample.setField(path, next);
        return;
      }

      if (frame !== undefined) {
        engine.setFrameValue({ sample: sampleId, path, frame }, next);
      }
    },
    [engine, frame, isFramePrimitive, path, sample, sampleId],
  );

  const clearField = useCallback(() => {
    if (!isFramePrimitive) {
      sample.deleteField(path);
      return;
    }

    if (frame !== undefined) {
      engine.deleteFrameValue({ sample: sampleId, path, frame });
    }
  }, [engine, frame, isFramePrimitive, path, sample, sampleId]);

  const primitiveSchema = generatePrimitiveSchema(path, currentLabelSchema);

  const [fieldValue, setFieldValue] = useState<Primitive>(
    parseDatabaseValue(value),
  );

  // synchronize external value changes with field
  useEffect(() => setFieldValue(parseDatabaseValue(value)), [value]);

  // need to use a ref to access field value in command callback;
  // command will run before the next render loop when `fieldValue` is updated.
  const transientFieldValue = useRef<Primitive>(fieldValue);

  // undoable command which handles primitive edits
  const editCommand = useCreateCommand(
    KnownContexts.ModalAnnotate,
    `primitive-edit-${path}`,
    useCallback(() => {
      const oldValue = value;
      const newValue = transientFieldValue.current;
      const isAddOperation = isAdd(path, sample);

      return new DelegatingUndoable(
        `primitive-edit-${path}-action`,
        // stage mutation on execute
        () => {
          try {
            const serializedValue = serializeFieldValue(newValue, type);
            if (
              !isAddOperation &&
              (isNullish(serializedValue) || serializedValue === "")
            ) {
              clearField();
            } else {
              writeField(serializedValue);
            }
          } catch (err) {
            console.warn("unparseable value", newValue);
          }
        },
        // restore original value on undo
        () => {
          const hasOldValue = !isNullish(oldValue);
          let oldValueSerialized = oldValue;
          if (type === "date" || type === "datetime") {
            oldValueSerialized = serializeDatabaseDateValue(oldValue);
          }

          if (isAddOperation && !hasOldValue) {
            clearField();
          } else {
            writeField(oldValueSerialized);
          }
        },
      );
    }, [clearField, path, sample, type, value, writeField]),
    () => true,
  );

  const handleChange = useCallback(
    (data: unknown) => {
      transientFieldValue.current = data as Primitive;
      setFieldValue(data as Primitive);

      if (editCommand.enabled) {
        editCommand.callback();
      }
    },
    [editCommand],
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

function isAdd(path: string, sample: Sample) {
  if (!path.includes(".")) return false;
  const parentPath = path.split(".").slice(0, -1).join(".");
  const parentValue = sample.getResolved(parentPath);
  return isNullish(parentValue);
}
