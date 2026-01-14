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
import { SchemaType } from "../../../../../plugins/SchemaIO/utils/types";
import useLabelSchema from "../SchemaManager/EditFieldLabelSchema/useLabelSchema";
import { useSampleValue } from "../useSampleValue";
import {
  createCheckbox,
  createJSONEditor,
  createRadio,
  createSelect,
  createSlider,
  createText,
  createToggle,
} from "./AnnotationSchema";
import useExit from "./useExit";

interface PrimitiveSchema {
  type: string;
  component?: string;
  choices?: unknown[];
  values?: string[];
  range?: [number, number];
}

function parsePrimitiveSchema(
  name: string,
  schema: PrimitiveSchema
): SchemaType | undefined {
  console.log(schema);

  if (schema.component === "radio") {
    return createRadio(name, schema.choices);
  }
  if (schema.component === "dropdown") {
    return createSelect(name, schema.values);
  }

  if (schema.type === "bool") {
    if (schema.component === "checkbox") {
      return createCheckbox(name);
    }
    return createToggle(name);
  }
  if (schema.type === "str") {
    return createText(name, "string");
  }
  if (schema.type === "dict") {
    return createJSONEditor(name);
  }
  if (schema.type === "float" || schema.type === "int") {
    if (schema.range) {
      return createSlider(name, schema.range);
    }
    return createText(name, "number");
  }
  return undefined;
}

interface PrimitiveEditProps {
  path: string;
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
  const [fieldValue, setFieldValue] = useState<Primitive>(value as Primitive);

  const handleChange = (data: unknown) => {
    setFieldValue(data as Primitive);
  };

  const persistData = useCallback(async () => {
    if (!fieldSchema) return;
    await commandBus.execute(
      new UpsertAnnotationCommand(
        {
          type: "Primitive",
          data: fieldValue,
          path: path,
        } as PrimitiveValue,
        fieldSchema
      )
    );
  }, [fieldSchema, fieldValue, path]);

  const handleSave = async () => {
    if (!fieldSchema) {
      console.error("Field schema not found for path:", path);
      return;
    }
    try {
      await persistData();
      setNotification({
        msg: `Primitive ${path} value saved successfully.`,
        variant: "success",
      });
      onExit();
    } catch (error) {
      setNotification({
        msg: `Failed to save primitive ${path}.`,
        variant: "error",
      });
    }
  };

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
