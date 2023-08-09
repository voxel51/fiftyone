import React from "react";
import { Autocomplete, TextField } from "@mui/material";
import FieldWrapper from "./FieldWrapper";
import autoFocus from "../utils/auto-focus";
import { getComponentProps } from "../utils";

export default function AutocompleteView(props) {
  const { onChange, path, schema, data } = props;
  const { view = {} } = schema;
  const { choices = [], readOnly } = view;

  const multiple = schema.type === "array";

  return (
    <FieldWrapper {...props}>
      <Autocomplete
        disabled={readOnly}
        autoHighlight
        clearOnBlur={multiple}
        defaultValue={getDefaultValue(data ?? schema?.default, choices)}
        freeSolo
        size="small"
        onChange={(e, choice) => onChange(path, choice?.value || choice)}
        options={choices.map((choice) => ({
          id: choice.value,
          label: choice.label || choice.value,
          value: choice.value,
        }))}
        renderInput={(params) => (
          <TextField
            autoFocus={autoFocus(props)}
            {...params}
            placeholder={
              multiple
                ? "Type and press enter to add a value"
                : "Type or select a value"
            }
          />
        )}
        onInputChange={(e) => {
          if (!multiple && e) {
            onChange(path, e.target.value);
          }
        }}
        isOptionEqualToValue={() => false} // allow duplicates
        multiple={multiple}
        {...getComponentProps(props, "autocomplete")}
      />
    </FieldWrapper>
  );
}

function getDefaultValue(defaultValue, choices = []) {
  const choice = choices.find(({ value }) => value === defaultValue);
  return choice || defaultValue;
}
