import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";
import { Primitive } from "@fiftyone/utilities";
import styled from "styled-components";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import JSONEditor, {
  JSONValue,
} from "../SchemaManager/EditFieldLabelSchema/JSONEditor";

const EditorContainer = styled.div`
  height: 400px;
  display: flex;
  flex-direction: column;
`;

interface PrimitiveRendererProps {
  type: string;
  fieldValue: Primitive;
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
  if (isJson) {
    return (
      <EditorContainer>
        <JSONEditor
          data={(fieldValue as JSONValue) || {}}
          onChange={handleChange}
          errors={false}
          scanning={false}
          showDocumentation={false}
        />
      </EditorContainer>
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
