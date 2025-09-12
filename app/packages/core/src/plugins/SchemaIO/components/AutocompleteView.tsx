import { Autocomplete, MenuItem, TextField } from "@mui/material";
import { get } from "lodash";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useKey } from "../hooks";
import { getComponentProps } from "../utils";
import ChoiceMenuItemBody from "./ChoiceMenuItemBody";
import FieldWrapper from "./FieldWrapper";

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

  // Draft state for the input field - this is what the user types
  const [draftValue, setDraftValue] = useState("");
  // Committed value - this is what gets sent to the parent
  const [committedValue, setCommittedValue] = useState(null);
  // Track if we're currently typing to avoid unnecessary updates
  const isTypingRef = useRef(false);
  // Track the last resolved value to prevent unnecessary re-resolves
  const lastResolvedValueRef = useRef(null);

  // Initialize draft value from external data
  const currentValue = useMemo(() => {
    return data ?? get(schema, "default");
  }, [data, schema]);

  // Initialize draft value when external data changes (but not while typing)
  useEffect(() => {
    if (!isTypingRef.current && currentValue !== lastResolvedValueRef.current) {
      const displayValue = getDisplayValue(currentValue, choices);
      setDraftValue(displayValue);
      setCommittedValue(currentValue);
      lastResolvedValueRef.current = currentValue;
    }
  }, [currentValue, choices]);

  // Get display value for the input field
  const getDisplayValue = useCallback((value, choices) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object" && value.label) return value.label;
    if (typeof value === "object" && value.value !== undefined)
      return value.value;
    return String(value);
  }, []);

  // Commit the draft value to the parent
  const commitValue = useCallback(
    (value) => {
      if (value === null || value === "") {
        onChange(path, null);
        setCommittedValue(null);
      } else if (allowUserInput) {
        // For user input, send the raw value
        onChange(path, value);
        setCommittedValue(value);
      } else {
        // For choice selection, resolve the value
        const resolvedValue = resolveChangedValue(schema, value, valuesOnly);
        onChange(path, resolvedValue);
        setCommittedValue(resolvedValue);
      }
      setUserChanged();
      isTypingRef.current = false;
    },
    [onChange, path, schema, valuesOnly, allowUserInput, setUserChanged]
  );

  return (
    <FieldWrapper {...props}>
      <Autocomplete
        disableClearable={!allowClearing}
        key={key}
        disabled={readOnly}
        autoHighlight
        clearOnBlur={multiple}
        value={committedValue}
        inputValue={draftValue}
        freeSolo={allowUserInput}
        size="small"
        onChange={(e, choice) => {
          isTypingRef.current = false;
          if (choice === null) {
            setDraftValue("");
            commitValue(null);
            return;
          }
          const displayValue = getDisplayValue(choice, choices);
          setDraftValue(displayValue);
          commitValue(choice);
        }}
        onInputChange={(e, value, reason) => {
          if (!e) return;

          // Update draft value immediately for responsive typing
          setDraftValue(value || "");
          isTypingRef.current = true;

          // Only commit on clear
          if (reason === "clear") {
            commitValue(null);
          }
        }}
        onBlur={() => {
          // Commit the current draft value on blur
          if (draftValue === "" || draftValue === null) {
            commitValue(null);
          } else if (allowUserInput) {
            commitValue(draftValue);
          }
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
        isOptionEqualToValue={(option, value) => {
          if (allowDups) return false;
          option = resolveChangedValue(schema, option, true);
          value = resolveChangedValue(schema, value, true);
          return option == value;
        }}
        multiple={multiple}
        renderOption={(optionProps, option) => {
          return (
            <MenuItem
              {...optionProps}
              {...getComponentProps(props, "optionContainer")}
            >
              <ChoiceMenuItemBody
                {...(typeof option === "object" && option !== null
                  ? option
                  : {})}
                {...props}
              />
            </MenuItem>
          );
        }}
        {...getComponentProps(props, "autocomplete")}
      />
    </FieldWrapper>
  );
}

// TODO: move these functions to a utils file

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
