import Form from "@rjsf/mui";
import validator from "@rjsf/validator-ajv8";
import React, { useEffect, useRef, useState } from "react";

import { translateSchema } from "./translators";
import { filterEmptyArrays, transformErrors } from "./utils";

import templates from "./templates";
import widgets from "./widgets";

export { isJSONSchema, isSchemaIOSchema } from "./translators";

import type { IChangeEvent } from "@rjsf/core";
import { isObject, type RJSFSchema } from "@rjsf/utils";
import { SmartFormProps } from "../types";
import { isNullish } from "@fiftyone/utilities";

export default function RJSF(props: SmartFormProps) {
  const { formProps } = props;
  const formRef = useRef<{ validateForm: () => boolean } | null>(null);
  const [revision, setRevision] = useState(0);

  const data = props.data;
  const { liveValidate } = formProps || {};

  useEffect(() => {
    if (isNullish(data)) {
      setRevision((r) => r + 1);
    }
  }, [data]);

  useEffect(() => {
    if (formRef.current && liveValidate) {
      // validate on mount if liveValidate is enabled
      formRef.current.validateForm?.();
    }
  }, [liveValidate]);

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
      const filteredData = filterEmptyArrays(
        event.formData as Record<string, unknown>,
        props.data as Record<string, unknown>
      );
      props.onChange(filteredData);
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
      key={revision}
      ref={formRef}
      schema={schema as RJSFSchema}
      uiSchema={uiSchema}
      validator={validator}
      widgets={widgets}
      templates={templates}
      formData={data}
      onChange={handleChange}
      onSubmit={handleSubmit}
      showErrorList={false}
      transformErrors={transformErrors}
      {...props.formProps}
    />
  );
}
