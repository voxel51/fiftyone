import React from "react";
import { Autocomplete, TextField } from "@mui/material";

export default function AutocompleteView(props) {
  const { onChange, path, schema, data } = props;
  const { view = {} } = schema;
  const { choices = [] } = view;

  return (
    <Autocomplete
      defaultValue={getDefaultOptions(data ?? schema?.default, choices)}
      freeSolo
      size="small"
      onChange={(e, choice) => onChange(path, choice?.value || choice)}
      options={choices.map((choice) => ({ id: choice.value, ...choice }))}
      renderInput={(params) => <TextField {...params} />}
    />
  );
}

function getDefaultOptions(defaultValue, choices = []) {
  const choice = choices.find(({ value }) => value === defaultValue);
  return choice || defaultValue;
}
