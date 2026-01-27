import {
  getFieldSchema,
  UpsertAnnotationCommand,
  useSampleMutationManager,
} from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import * as fos from "@fiftyone/state";
import { PrimitiveValue } from "@fiftyone/state";
import { Primitive } from "@fiftyone/utilities";
import {
  Button,
  DatePicker,
  Orientation,
  Stack,
  Variant,
} from "@voxel51/voodo";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import JSONEditor from "../SchemaManager/EditFieldLabelSchema/JSONEditor";
import { generatePrimitiveSchema, PrimitiveSchema } from "./schemaHelpers";
import { parseDatabaseValue, serializeFieldValue } from "./serialization";
import useExit from "./useExit";
import {
  DelegatingUndoable,
  KnownContexts,
  useCreateCommand,
} from "@fiftyone/commands";

interface PrimitiveEditProps {
  path: string;
  currentLabelSchema: PrimitiveSchema;
}

const EditorContainer = styled.div`
  height: 400px;
  display: flex;
  flex-direction: column;
`;

export default function PrimitiveEdit({
  path,
  currentLabelSchema,
}: PrimitiveEditProps) {
  const { type } = currentLabelSchema;
  const commandBus = useCommandBus();
  const setNotification = fos.useNotification();
  const onExit = useExit();
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

  const sampleMutationManager = useSampleMutationManager();
  const value = sampleMutationManager.getPathValue(path);

  const fieldSchema = getFieldSchema(schema, path);
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
    KnownContexts.Modal,
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

  const persistData = useCallback(async () => {
    if (!fieldSchema) return;
    const dataToSave = serializeFieldValue(fieldValue, type);
    return await commandBus.execute(
      new UpsertAnnotationCommand(
        {
          type: "Primitive",
          data: dataToSave,
          path: path,
        } as PrimitiveValue,
        fieldSchema
      )
    );
  }, [fieldSchema, fieldValue, path, type]);

  const handleSave = useCallback(async () => {
    try {
      const result = await persistData();
      if (result) {
        setNotification({
          msg: `Primitive ${path} value saved successfully.`,
          variant: "success",
        });
        onExit();
      } else {
        setNotification({
          msg: `Failed to save primitive ${path}.`,
          variant: "error",
        });
      }
    } catch (error) {
      console.error("Error while saving primitive:", error);
      setNotification({
        msg: `Error while saving primitive ${path}.`,
        variant: "error",
      });
    }
  }, [path, persistData, setNotification, onExit]);

  const isJson = type === "dict";
  const isDate = type === "date" || type === "datetime";

  return (
    <Stack orientation={Orientation.Column}>
      {/* todo - schemaio component is not working correctly for dict fields */}
      {/* this works fine but ideally we should use the schemaio component for all fields */}
      {isJson ? (
        <EditorContainer>
          <JSONEditor
            data={fieldValue as string}
            onChange={handleChange}
            errors={false}
            scanning={false}
          />
        </EditorContainer>
      ) : isDate ? (
        <DatePicker
          selected={fieldValue as Date}
          showTimeSelect={type === "datetime"}
          onChange={(date: Date | null) => {
            handleChange(date);
          }}
        />
      ) : (
        <SchemaIOComponent
          smartForm={true}
          schema={primitiveSchema}
          onChange={handleChange}
          data={fieldValue}
        />
      )}
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
