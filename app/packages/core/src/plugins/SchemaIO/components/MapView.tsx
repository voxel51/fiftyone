import React from "react";
import ListView from "./ListView";
import { getComponentProps } from "../utils";

export default function MapView(props) {
  const { id, schema, onChange, path, data, errors } = props;
  const { additionalProperties, view = {} } = schema;
  const keyLabel = schema?.view?.key?.label || "Key";

  return (
    <ListView
      {...props}
      id={id}
      schema={{
        type: "array",
        items: {
          type: "array",
          items: [
            {
              type: "string",
              view: {
                component: "FieldView",
                label: keyLabel,
                ...getComponentProps(props, "key"),
              },
            },
            additionalProperties,
          ],
          view: {
            component: "TupleView",
            ...getComponentProps(props, "entryContainer"),
          },
        },
        view: { ...view, hideIndexLabel: true },
      }}
      data={getFormattedValue(data)}
      onChange={(path, value) => {
        onChange(path, getActualValue(value));
      }}
    />
  );
}

function getActualValue(value) {
  const actualValue = {};
  for (const tuple of value) {
    const [key, value] = tuple;
    if (!key) continue; // skipping empty
    actualValue[key] = value;
  }
  return actualValue;
}

function getFormattedValue(value) {
  const formattedValue = [];
  for (const key in value) {
    formattedValue.push([key, value]);
  }
  return formattedValue;
}
