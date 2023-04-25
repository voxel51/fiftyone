import React from "react";
import { Autocomplete, TextField } from "@mui/material";
import FieldWrapper from "./FieldWrapper";

export default function AutocompleteView(props) {
  const { onChange, path, schema, data } = props;
  const { view = {} } = schema;
  const { choices = [] } = view;

  const multiple = schema.type === "array";

  return (
    <FieldWrapper {...props}>
      <Autocomplete
        autoHighlight
        clearOnBlur={multiple}
        defaultValue={getDefaultValue(data ?? schema?.default, choices)}
        freeSolo
        size="small"
        onChange={(e, choice) => onChange(path, choice?.value || choice)}
        options={choices.map((choice) => ({ id: choice.value, ...choice }))}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Type and press enter to add an item"
          />
        )}
        onInputChange={(e) => {
          if (!multiple) {
            onChange(path, e.target.value);
          }
        }}
        isOptionEqualToValue={() => false} // allow duplicates
        multiple={multiple}
      />
    </FieldWrapper>
  );
}

function getDefaultValue(defaultValue, choices = []) {
  const choice = choices.find(({ value }) => value === defaultValue);
  return choice || defaultValue;
}
