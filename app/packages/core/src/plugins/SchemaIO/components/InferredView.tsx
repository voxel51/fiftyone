import React from "react";
import { generateSchema, log } from "../utils";
import DynamicIO from "./DynamicIO";

// todo: add support for input
export default function InferredView(props) {
  const { data, schema, onChange } = props;
  const generatedSchema = generateSchema(data, { label: schema?.view?.label });
  return <DynamicIO {...props} schema={generatedSchema} />;
}
