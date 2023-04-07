import React from "react";
import { Autocomplete, TextField } from "@mui/material";

export default function AutocompleteView(props) {
  const { onChange, path, schema } = props;
  const { view = {} } = schema;
  const { choices = [] } = view;

  return (
    <Autocomplete
      freeSolo
      size="small"
      onChange={(e, choice) => onChange(path, choice?.value || choice)}
      options={choices.map((choice) => ({ id: choice.value, ...choice }))}
      renderInput={(params) => <TextField {...params} />}
    />
  );
}
