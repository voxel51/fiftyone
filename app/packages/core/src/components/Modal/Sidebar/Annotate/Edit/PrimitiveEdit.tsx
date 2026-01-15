import { getFieldSchema, UpsertAnnotationCommand } from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/commands";
import * as fos from "@fiftyone/state";
import { PrimitiveValue } from "@fiftyone/state";
import { Primitive } from "@fiftyone/utilities";
import {
  Button,
  Orientation,
  Stack,
  Text,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useCallback, useState } from "react";
import { useRecoilValue } from "recoil";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import JSONEditor from "../SchemaManager/EditFieldLabelSchema/JSONEditor";
import { useSampleValue } from "../useSampleValue";
import { parsePrimitiveSchema, PrimitiveSchema } from "./schemaHelpers";
import useExit from "./useExit";

interface PrimitiveEditProps {
  path: string;
  currentLabelSchema: PrimitiveSchema;
}

/**
 * Processes a dict/JSON field value by parsing string values to objects.
 * Handles empty strings by converting them to null.
 */
function processDictFieldValue(fieldValue: Primitive, type: string): Primitive {
  if (type !== "dict") {
    return fieldValue;
  }
  const trimmedValue = (fieldValue as string).trim();
  if (trimmedValue === "") {
    return null;
  }
  return JSON.parse(trimmedValue);
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
  const primitiveSchema = parsePrimitiveSchema(path, currentLabelSchema);

  const [fieldValue, setFieldValue] = useState<Primitive>(
    getInitialValue(type, value)
  );

  const handleChange = (data: unknown) => {
    setFieldValue(data as Primitive);
  };

  const persistData = useCallback(async () => {
    if (!fieldSchema) return;
    // For dict/JSON fields, parse the string value to an object before saving
    const dataToSave = processDictFieldValue(fieldValue, type);
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
    if (!fieldSchema) {
      console.error("Field schema not found for path:", path);
      return;
    }
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

  const EditContent = () => {
    const isJson = type === "dict";
    const isDate = type === "date";
    // todo - schemaio component is not working correctly for dict fields
    // this works fine but ideally we should use the schemaio component for all fields
    if (isJson) {
      return (
        <div
          style={{ height: "400px", display: "flex", flexDirection: "column" }}
        >
          <JSONEditor
            data={fieldValue as string}
            onChange={handleChange}
            errors={false}
            scanning={false}
          />
        </div>
      );
    }
    // todo - date editor when supported
    // if (isDate) {
    //   return <DateEditor data={fieldValue} onChange={handleChange} />;
    // }
    if (!primitiveSchema) {
      return (
        <Text variant={TextVariant.Label}>
          Could not determine schema for path: {path}
        </Text>
      );
    }
    return (
      <SchemaIOComponent
        smartForm={true}
        schema={primitiveSchema}
        onChange={handleChange}
        data={fieldValue}
      />
    );
  };

  return (
    <Stack orientation={Orientation.Column}>
      <EditContent />
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
