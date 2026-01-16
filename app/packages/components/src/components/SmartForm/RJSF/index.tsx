import Form from "@rjsf/mui";
import validator from "@rjsf/validator-ajv8";
import React from "react";

import { translateSchema } from "./translators";
import { filterEmptyArrays } from "./utils";

import templates from "./templates";
import widgets from "./widgets";

export { isJSONSchema, isSchemaIOSchema } from "./translators";

import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";
import type { IChangeEvent } from "@rjsf/core";
import { isObject, type RJSFSchema, type UiSchema } from "@rjsf/utils";

export interface RJSFProps {
  schema?: SchemaType;
  jsonSchema?: RJSFSchema;
  uiSchema?: UiSchema;
  data?: unknown;
  onChange?: (data: unknown) => void;
  onSubmit?: (data: unknown) => void;
}

export default function RJSF(props: RJSFProps) {
  if (!props.schema && !props.jsonSchema) {
    console.log(
      "[SmartForm][RJSF] Either `schema` or `jsonSchema` must be provided"
    );
    return null;
  }

  const { schema, uiSchema, warnings } = props.schema
    ? translateSchema(props.schema)
    : {
        schema: props.jsonSchema,
        uiSchema: props.uiSchema,
        warnings: [],
      };

  if (warnings.length > 0) {
    console.warn("[SmartForm][RJSF] Schema translation warnings:", warnings);
  }

  const handleChange = (event: IChangeEvent, _id?: string) => {
    if (!props.onChange) return;

    if (isObject(props.data) && isObject(event.formData)) {
      return filterEmptyArrays(
        event.formData as Record<string, unknown>,
        props.data as Record<string, unknown>
      );
    } else {
      props.onChange(event.formData);
    }
  };

  const handleSubmit = (event: IChangeEvent, _nativeEvent: React.FormEvent) => {
    if (props.onSubmit) {
      props.onSubmit(event.formData);
    }
  };

  return (
    <Form
      schema={schema}
      uiSchema={uiSchema}
      validator={validator}
      widgets={widgets}
      templates={templates}
      formData={props.data}
      onChange={handleChange}
      onSubmit={handleSubmit}
    />
  );
}
