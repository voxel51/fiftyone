import React from "react";
import { generateSchema } from "../utils";
import DynamicIO from "./DynamicIO";

export default function InferredView(props) {
  const { schema = {} } = props;
  const { view = {}, default: defaultValue, readOnly } = schema;
  const generatedSchema = generateSchema(defaultValue, {
    label: view.label,
    readOnly: readOnly || view.readOnly,
  });
  const schemaWithDefault = { ...generatedSchema, default: defaultValue };
  return <DynamicIO {...props} schema={schemaWithDefault} />;
}
