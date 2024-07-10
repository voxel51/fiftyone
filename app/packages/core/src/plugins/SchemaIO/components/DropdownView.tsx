import { MenuItem, Select } from "@mui/material";
import React, { useState } from "react";
import { useKey } from "../hooks";
import { getComponentProps, getFieldSx } from "../utils";
import autoFocus from "../utils/auto-focus";
import { ViewPropsType } from "../utils/types";
import AlertView from "./AlertView";
import ChoiceMenuItemBody from "./ChoiceMenuItemBody";
import FieldWrapper from "./FieldWrapper";

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
    compact,
    label,
    description,
    color,
    variant,
  } = view;
  const [key, setUserChanged] = useKey(path, schema, data, true);
  const [selected, setSelected] = useState(false);

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
  const { MenuProps = {}, ...selectProps } = getComponentProps(
    props,
    "select",
    {
      sx: {
        ".MuiSelect-select": {
          padding: "0.45rem 2rem 0.45rem 1rem",
          opacity: selected ? 1 : 0.5,
        },
        ...getFieldSx({ color, variant }),
      },
    }
  );

  return (
    <FieldWrapper {...props} hideHeader={compact}>
      <Select
        key={key}
        disabled={readOnly}
        autoFocus={autoFocus(props)}
        defaultValue={computedDefaultValue}
        size="small"
        fullWidth
        displayEmpty
        title={compact ? description : undefined}
        renderValue={(value) => {
          const unselected = value?.length === 0;
          setSelected(!unselected);
          if (unselected) {
            if (compact) {
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
