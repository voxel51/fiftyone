import React from "react";
import Form from "@rjsf/mui";
import validator from "@rjsf/validator-ajv8";

import { translateSchema } from "./translators";

import widgets from "./widgets";
import templates from "./templates";

export { isSchemaIOSchema, isJSONSchema } from "./translators";

import type { IChangeEvent } from "@rjsf/core";
import type { RJSFSchema, UiSchema, ValidatorType } from "@rjsf/utils";
import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";

export interface RJSFProps {
  schema?: SchemaType;
  jsonSchema?: RJSFSchema;
  uiSchema?: UiSchema;
  data?: unknown;
  onChange?: (data: unknown) => void;
  onSubmit?: (data: unknown) => void;
  validator?: ValidatorType;
  liveValidate?: boolean;
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
    if (props.onChange) {
      // Filter out empty arrays that weren't in the original data
      // i.e. don't add `tags: []` if `tags` does not already exist on props.data
      const filteredData = { ...event.formData };
      if (
        props.data &&
        typeof props.data === "object" &&
        typeof filteredData === "object"
      ) {
        for (const key in filteredData) {
          if (
            !(key in props.data) &&
            Array.isArray(filteredData[key]) &&
            filteredData[key].length === 0
          ) {
            delete filteredData[key];
          }
        }
      }
      props.onChange(filteredData);
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
      validator={props.validator ?? validator}
      widgets={widgets}
      templates={templates}
      formData={props.data}
      onChange={handleChange}
      onSubmit={handleSubmit}
      liveValidate={props.liveValidate ?? true}
    />
  );
}
