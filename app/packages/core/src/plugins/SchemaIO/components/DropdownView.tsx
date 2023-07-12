import { Box, ListItemText, MenuItem, Select, Typography } from "@mui/material";
import React from "react";
import { getComponentProps } from "../utils";
import autoFocus from "../utils/auto-focus";
import AlertView from "./AlertView";
import FieldWrapper from "./FieldWrapper";

const MULTI_SELECT_TYPES = ["string", "array"];

export default function DropdownView(props) {
  const { onChange, schema, path, data } = props;
  const { default: defaultValue, view = {}, type } = schema;
  const {
    choices,
    multiple: multiSelect,
    placeholder = "",
    separator = ",",
    readOnly,
  } = view;

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
  const rawDefaultValue = data ?? defaultValue ?? fallbackDefaultValue;
  const computedDefaultValue =
    multiple && !Array.isArray(rawDefaultValue)
      ? rawDefaultValue.toString().split(separator)
      : rawDefaultValue;

  const choiceLabels = choices.reduce((labels, choice) => {
    labels[choice.value] = choice.label;
    return labels;
  }, {});

  return (
    <FieldWrapper {...props}>
      <Select
        disabled={readOnly}
        autoFocus={autoFocus(props)}
        defaultValue={computedDefaultValue}
        size="small"
        fullWidth
        displayEmpty
        renderValue={(value) => {
          if (value?.length === 0) {
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
          onChange(path, computedValue);
        }}
        multiple={multiple}
        {...getComponentProps(props, "select")}
      >
        {choices.map(({ value, label, description, caption }) => (
          <MenuItem
            key="value"
            value={value}
            {...getComponentProps(props, "optionContainer")}
          >
            <ListItemText
              primary={
                <Typography {...getComponentProps(props, "optionLabel")}>
                  {label}
                </Typography>
              }
              secondary={
                <Box>
                  <Typography
                    variant="body2"
                    {...getComponentProps(props, "optionDescription")}
                  >
                    {description}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.tertiary"
                    {...getComponentProps(props, "optionCaption")}
                  >
                    {caption}
                  </Typography>
                </Box>
              }
              {...getComponentProps(props, "option")}
            />
          </MenuItem>
        ))}
      </Select>
    </FieldWrapper>
  );
}
