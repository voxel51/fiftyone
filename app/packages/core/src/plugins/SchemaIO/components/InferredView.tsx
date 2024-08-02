import React from "react";
import { generateSchema } from "../utils";
import DynamicIO from "./DynamicIO";

export default function InferredView(props) {
  const { data, schema = {} } = props;
  const { view = {}, default: defaultValue, readOnly } = schema;
  const value = data ?? defaultValue;
  const generatedSchema = generateSchema(value, {
    label: view.label,
    readOnly: readOnly || view.readOnly,
  });
  const schemaWithDefault = { ...generatedSchema, default: value };
  return <DynamicIO {...props} schema={schemaWithDefault} />;
}
