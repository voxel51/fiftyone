import React from "react";
import { Autocomplete, MenuItem, Select, TextField } from "@mui/material";
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
  const allowDups = view.allow_duplicates !== false;
  const [key, setUserChanged] = useKey(path, schema, data, true);
  const valuesOnly = getValuesOnlySettingFromSchema(schema);
  const allowUserInput = view.allow_user_input !== false;
  const allowClearing = view.allow_clearing !== false;
  return (
    <FieldWrapper {...props}>
      <Autocomplete
        disableClearable={!allowClearing}
        key={key}
        disabled={readOnly}
        autoHighlight
        clearOnBlur={multiple}
        defaultValue={getDefaultValue(data, choices)}
        freeSolo={allowUserInput}
        size="small"
        onChange={(e, choice) => {
          if (choice === null) {
            onChange(path, null);
            setUserChanged();
            return;
          }
          const changedValue = resolveChangedValues(
            schema,
            choice,
            valuesOnly,
            multiple
          );
          onChange(path, changedValue);
          setUserChanged();
        }}
        options={choices.map((choice) => ({
          id: choice.value,
          label: choice.label || choice.value,
          ...choice,
        }))}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={
              multiple
                ? "Type and press enter to add a value"
                : "Type or select a value"
            }
          />
        )}
        onInputChange={(e) => {
          if (!e) return;
          if (!e.target.value && !multiple) {
            onChange(path, null);
            setUserChanged();
          }
          if (!multiple && e && allowUserInput) {
            onChange(path, e.target.value);
            setUserChanged();
          }
        }}
        isOptionEqualToValue={(option, value) => {
          if (allowDups) return false;
          option = resolveChangedValue(schema, option, true);
          value = resolveChangedValue(schema, value, true);
          return option == value;
        }}
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

// TODO: move these functions to a utils file

function getDefaultValue(defaultValue, choices = []) {
  const choice = choices.find(({ value }) => value === defaultValue);
  return choice || defaultValue;
}

function getValuesOnlySettingFromSchema(schema) {
  const { view = {} } = schema;
  const isObject = schema.type === "object";
  const providedSetting = view.value_only;
  const isDefined = providedSetting !== undefined && providedSetting !== null;
  if (isDefined) return providedSetting;
  if (isObject) return false;
  return true;
}

function resolveChangedValues(schema, choice, valuesOnly, multiple) {
  if (multiple) {
    if (Array.isArray(choice))
      return choice.map((c) => resolveChangedValue(schema, c, valuesOnly));
    return [];
  } else {
    return resolveChangedValue(schema, choice, valuesOnly);
  }
}

function resolveChangedValue(schema, choice, valuesOnly) {
  let resolvedValue;
  const isObjectSchema = schema.type === "object";
  const isStringSchema = schema.type === "string";
  const isChoiceObject =
    typeof choice === "object" &&
    choice.value !== undefined &&
    choice.value !== null;
  const valuesOnlyIsDefault = valuesOnly == undefined || valuesOnly == null;
  if (!isChoiceObject) {
    choice = { id: choice, value: choice };
  }
  if (isStringSchema && valuesOnlyIsDefault) {
    valuesOnly = true;
  }
  if (isObjectSchema) {
    resolvedValue = choice;
  }
  if (valuesOnly) {
    resolvedValue = choice.value;
  }
  return resolvedValue;
}
