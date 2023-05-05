import React from "react";
import { generateSchema } from "../utils";
import DynamicIO from "./DynamicIO";

export default function InferredView(props) {
  const { data, schema } = props;
  const readOnly = schema?.readOnly || schema?.view?.readOnly;
  const generatedSchema = generateSchema(data || schema?.default, {
    label: schema?.view?.label,
    readOnly,
  });

  return <DynamicIO {...props} schema={generatedSchema} />;
}
