import { Button, Orientation, Stack } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import { SchemaType } from "../../../../../plugins/SchemaIO/utils/types";
import useLabelSchema from "../SchemaManager/EditFieldLabelSchema/useLabelSchema";
import { useSampleValue } from "../useSampleValue";
import { createInput, createRadio, createTags } from "./AnnotationSchema";
import { primitivePath } from "./state";

function parsePrimitiveSchema(name, schema): SchemaType | undefined {
  if (schema.component === "text") {
    return createInput(name, { ftype: "text", multipleOf: 0 });
  }

  if (schema.component === "radio") {
    return createRadio(name, schema.choices);
  }

  if (schema.component === "dropdown") {
    return createTags(name, schema.values);
  }
  return undefined;
}

export default function PrimitiveEdit() {
  // how to save? - update useRecoilCallback
  const path = useAtomValue(primitivePath);
  const _path = path ?? "";
  const schema = useLabelSchema(_path);
  const labelSchema = schema?.currentLabelSchema ?? {};
  const data = useSampleValue(_path);
  const primitiveSchema = parsePrimitiveSchema(path, labelSchema);

  const handleChange = (data: unknown) => {
    console.log("change", data);
  };

  if (!primitiveSchema) {
    return null;
  }

  return (
    <Stack orientation={Orientation.Column}>
      <SchemaIOComponent
        key={path}
        schema={primitiveSchema}
        onChange={handleChange}
        data={data}
      />
      <Button
        onClick={() => {
          console.log("save");
        }}
      >
        Save
      </Button>
    </Stack>
  );
}
