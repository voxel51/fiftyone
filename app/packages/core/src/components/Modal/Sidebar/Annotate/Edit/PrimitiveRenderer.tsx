import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";
import { Primitive } from "@fiftyone/utilities";
import { DatePicker } from "@voxel51/voodo";
import styled from "styled-components";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import JSONEditor from "../SchemaManager/EditFieldLabelSchema/JSONEditor";

const EditorContainer = styled.div`
  height: 400px;
  display: flex;
  flex-direction: column;
`;

interface PrimitiveRendererProps {
  type: string;
  fieldValue: Primitive | Date;
  handleChange: (data: unknown) => void;
  primitiveSchema: SchemaType | undefined;
}

export default function PrimitiveRenderer({
  type,
  fieldValue,
  handleChange,
  primitiveSchema,
}: PrimitiveRendererProps) {
  const isJson = type === "dict";
  const isDate = type === "date" || type === "datetime";
  if (isJson) {
    return (
      <EditorContainer>
        <JSONEditor
          data={fieldValue as string}
          onChange={handleChange}
          errors={false}
          scanning={false}
        />
      </EditorContainer>
    );
  }

  if (isDate) {
    return (
      <DatePicker
        selected={fieldValue as Date}
        showTimeSelect={type === "datetime"}
        onChange={(date: Date | null) => {
          handleChange(date);
        }}
      />
    );
  }

  if (!primitiveSchema) {
    return null;
  }

  return (
    <SchemaIOComponent
      smartForm={true}
      schema={primitiveSchema}
      onChange={handleChange}
      data={fieldValue}
    />
  );
}
