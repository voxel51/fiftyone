import { getFieldSchema, UpsertAnnotationCommand } from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import * as fos from "@fiftyone/state";
import { PrimitiveValue } from "@fiftyone/state";
import { Primitive } from "@fiftyone/utilities";
import {
  Button,
  Orientation,
  Stack,
  Variant,
} from "@voxel51/voodo";
import React, { useCallback, useState } from "react";
import { useRecoilValue } from "recoil";
import { useSampleValue } from "../useSampleValue";
import PrimitiveRenderer from "./PrimitiveRenderer";
import { generatePrimitiveSchema, PrimitiveSchema } from "./schemaHelpers";
import { parseDatabaseValue, serializeFieldValue } from "./serialization";
import useExit from "./useExit";

interface PrimitiveEditProps {
  path: string;
  currentLabelSchema: PrimitiveSchema;
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
  const primitiveSchema = generatePrimitiveSchema(path, currentLabelSchema);

  const [fieldValue, setFieldValue] = useState<Primitive | Date>(
    parseDatabaseValue(type, value)
  );

  const handleChange = (data: unknown) => {
    setFieldValue(data as Primitive);
  };

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
