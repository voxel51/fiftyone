import { getFieldSchema, UpsertAnnotationCommand } from "@fiftyone/annotation";
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
import { useCallback, useState } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import JSONEditor from "../SchemaManager/EditFieldLabelSchema/JSONEditor";
import { useSampleValue } from "../useSampleValue";
import { PrimitiveSchema, usePrimitiveSchema } from "./schemaHelpers";
import useExit from "./useExit";

interface PrimitiveEditProps {
  path: string;
  currentLabelSchema: PrimitiveSchema;
}

/**
 * processes dict fields by parsing string values to objects, returns
 * input value for other field types
 * @param fieldValue - the value of the field
 * @param type - the type of the field
 * @returns the processed value of the field
 */
function processFieldValue(fieldValue: Primitive, type: string): Primitive {
  if (type === "date" || type === "datetime") {
    return new Date(fieldValue as string).getTime();
  }
  if (type !== "dict") {
    return fieldValue;
  }
  const trimmedValue = (fieldValue as string).trim();
  if (trimmedValue === "") {
    return null;
  }
  try {
    return JSON.parse(trimmedValue);
  } catch (error) {
    throw new Error(`Invalid JSON: ${trimmedValue}`);
  }
}

/**
 * Convert raw value into a primitive of the format that we can
 * pass to SmartForm and handle dict fields correctly
 * @param type - the type of the field
 * @param value - the value of the field
 * @returns the initial value of the field
 */
function getInitialValue(type: string, value: unknown): Primitive {
  if (type === "dict") {
    // If the value is null/undefined, initialize with empty JSON object
    if (value === null || value === undefined) {
      return "{}";
    }
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }
  }
  return value as Primitive;
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
  const value = useSampleValue(path);

  const fieldSchema = getFieldSchema(schema, path);
  const primitiveSchema = usePrimitiveSchema(path, currentLabelSchema);

  const [fieldValue, setFieldValue] = useState<Primitive>(
    getInitialValue(type, value)
  );

  const handleChange = (data: unknown) => {
    setFieldValue(data as Primitive);
  };

  const persistData = useCallback(async () => {
    if (!fieldSchema) return;
    const dataToSave = processFieldValue(fieldValue, type);
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
          selected={fieldValue ? new Date(fieldValue as string) : null}
          showTimeSelect={type === "datetime"}
          onChange={(date: Date | null) => {
            handleChange(date ? date.toISOString() : null);
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
