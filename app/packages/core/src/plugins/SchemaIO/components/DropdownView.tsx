import { MenuItem, Select } from "@mui/material";
import React from "react";
import { useKey } from "../hooks";
import { getComponentProps } from "../utils";
import autoFocus from "../utils/auto-focus";
import AlertView from "./AlertView";
import ChoiceMenuItemBody from "./ChoiceMenuItemBody";
import FieldWrapper from "./FieldWrapper";
import { ViewPropsType } from "../utils/types";

const MULTI_SELECT_TYPES = ["string", "array"];

export default function DropdownView(props: ViewPropsType) {
  const { onChange, schema, path, data } = props;
  const { view = {}, type } = schema;
  const {
    choices,
    multiple: multiSelect,
    placeholder = "",
    separator = ",",
    readOnly,
    condensed,
    label,
    description,
  } = view;
  const [key, setUserChanged] = useKey(path, schema, data, true);

  if (multiSelect && !MULTI_SELECT_TYPES.includes(type))
    return (
      <AlertView
        schema={{
          view: {
            label: `Unsupported type "${type}" for multi-select`,
            description:
              "Multi-select is supported for types " +
              MULTI_SELECT_TYPES.join(", "),
            severity: "error",
          },
        }}
      />
    );

  const isArrayType = type === "array";
  const multiple = multiSelect || isArrayType;
  const fallbackDefaultValue = multiple ? [] : "";
  const rawDefaultValue = data ?? fallbackDefaultValue;
  const computedDefaultValue =
    multiple && !Array.isArray(rawDefaultValue)
      ? rawDefaultValue.toString().split(separator)
      : rawDefaultValue;

  const choiceLabels = choices.reduce((labels, choice) => {
    labels[choice.value] = choice.label;
    return labels;
  }, {});
  const { MenuProps = {}, ...selectProps } = getComponentProps(props, "select");

  return (
    <FieldWrapper {...props} hideHeader={condensed}>
      <Select
        key={key}
        disabled={readOnly}
        autoFocus={autoFocus(props)}
        defaultValue={computedDefaultValue}
        size="small"
        fullWidth
        displayEmpty
        title={condensed ? description : undefined}
        renderValue={(value) => {
          if (value?.length === 0) {
            if (condensed) {
              return placeholder || label;
            }
            return placeholder;
          }
          if (multiple) {
            return value.map((item) => choiceLabels[item] || item).join(", ");
          }
          return choiceLabels[value] || value;
        }}
        onChange={(e) => {
          const value = e.target.value;
          const computedValue =
            Array.isArray(value) && type !== "array"
              ? value.join(separator)
              : value;
          onChange(path, computedValue, schema);
          setUserChanged();
        }}
        multiple={multiple}
        {...selectProps}
        MenuProps={{
          ...MenuProps,
          sx: {
            zIndex: (theme) => theme.zIndex.operatorPalette + 1,
            ...(MenuProps?.sx || {}),
          },
        }}
      >
        {choices.map(({ value, ...choice }) => (
          <MenuItem
            key="value"
            value={value}
            {...getComponentProps(props, "optionContainer")}
          >
            <ChoiceMenuItemBody {...choice} {...props} />
          </MenuItem>
        ))}
      </Select>
    </FieldWrapper>
  );
}
