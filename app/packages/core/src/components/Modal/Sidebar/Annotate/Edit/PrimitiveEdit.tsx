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
import useLabelSchema from "../SchemaManager/EditFieldLabelSchema/useLabelSchema";
import { useSampleValue } from "../useSampleValue";
import { parsePrimitiveSchema } from "./schemaHelpers";
import useExit from "./useExit";

interface PrimitiveEditProps {
  path: string;
}

/**
 * Processes a dict/JSON field value by parsing string values to objects.
 * Handles empty strings by converting them to null.
 */
function processDictFieldValue(
  fieldValue: Primitive,
  currentLabelSchema?: { type?: string }
): Primitive {
  const isDictField = currentLabelSchema?.type === "dict";
  if (!isDictField) {
    return fieldValue;
  }
  const trimmedValue = (fieldValue as string).trim();
  if (trimmedValue === "") {
    return null;
  }
  return JSON.parse(trimmedValue);
}

export default function PrimitiveEdit({ path }: PrimitiveEditProps) {
  const commandBus = useCommandBus();
  const setNotification = fos.useNotification();
  const onExit = useExit();
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );
  const fieldSchema = getFieldSchema(schema, path);
  const { currentLabelSchema } = useLabelSchema(path);
  const value = useSampleValue(path);

  const primitiveSchema = parsePrimitiveSchema(path, currentLabelSchema);

  // For dict/JSON fields, stringify the initial value if it's an object
  // If the value is null/undefined, initialize with empty JSON object
  // TODO refactor this
  const getInitialValue = (): Primitive => {
    if (currentLabelSchema?.type === "dict") {
      if (value === null || value === undefined) {
        return "{}";
      }
      if (typeof value === "object") {
        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return value as Primitive;
        }
      }
      // If it's already a string, use it as-is (might be from previous edit)
      if (typeof value === "string") {
        return value;
      }
    }
    return value as Primitive;
  };

  const [fieldValue, setFieldValue] = useState<Primitive>(getInitialValue());

  const handleChange = (data: unknown) => {
    setFieldValue(data as Primitive);
  };

  const persistData = useCallback(async () => {
    if (!fieldSchema) return;

    // For dict/JSON fields, parse the string value to an object before saving
    const dataToSave = processDictFieldValue(fieldValue, currentLabelSchema);

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
  }, [fieldSchema, fieldValue, path, currentLabelSchema]);

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

  if (!primitiveSchema) {
    return (
      <Text variant={TextVariant.Label}>
        Could not determine schema for path: {path}
      </Text>
    );
  }

  console.log("primitiveSchema", primitiveSchema);

  return (
    <Stack orientation={Orientation.Column}>
      <SchemaIOComponent
        key={path}
        smartForm={true}
        schema={primitiveSchema}
        onChange={handleChange}
        data={fieldValue}
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
