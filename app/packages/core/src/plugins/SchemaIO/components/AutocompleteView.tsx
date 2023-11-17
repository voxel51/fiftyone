import React from "react";
import { Autocomplete, MenuItem, TextField } from "@mui/material";
import FieldWrapper from "./FieldWrapper";
import autoFocus from "../utils/auto-focus";
import { getComponentProps } from "../utils";
import ChoiceMenuItemBody from "./ChoiceMenuItemBody";
import { useKey } from "../hooks";

export default function AutocompleteView(props) {
  const { onChange, path, schema, data } = props;
  const { view = {} } = schema;
  const { choices = [], readOnly } = view;

  const multiple = schema.type === "array";
  const [key, setUserChanged] = useKey(path, schema, data, true);

  return (
    <FieldWrapper {...props}>
      <Autocomplete
        key={key}
        disabled={readOnly}
        autoHighlight
        clearOnBlur={multiple}
        defaultValue={getDefaultValue(data, choices)}
        freeSolo
        size="small"
        onChange={(e, choice) => {
          onChange(path, choice?.value || choice);
          setUserChanged();
        }}
        options={choices.map((choice) => ({
          id: choice.value,
          label: choice.label || choice.value,
          ...choice,
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
        renderOption={(props, option) => {
          return (
            <MenuItem
              {...props}
              {...getComponentProps(props, "optionContainer")}
            >
              <ChoiceMenuItemBody {...option} {...props} />
            </MenuItem>
          );
        }}
        {...getComponentProps(props, "autocomplete")}
      />
    </FieldWrapper>
  );
}

function getDefaultValue(defaultValue, choices = []) {
  const choice = choices.find(({ value }) => value === defaultValue);
  return choice || defaultValue;
}
