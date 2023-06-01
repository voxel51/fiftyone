import React from "react";
import { Box, Typography, Select, MenuItem, ListItemText } from "@mui/material";
import FieldWrapper from "./FieldWrapper";
import autoFocus from "../utils/auto-focus";
import { getComponentProps } from "../utils";

export default function DropdownView(props) {
  const { onChange, schema, path, data } = props;
  const { view = {}, type } = schema;
  const { choices } = view;

  const multiple = type === "array";

  const choiceLabels = choices.reduce((labels, choice) => {
    labels[choice.value] = choice.label;
    return labels;
  }, {});

  return (
    <FieldWrapper {...props}>
      <Select
        autoFocus={autoFocus(props)}
        defaultValue={data ?? schema.default ?? (multiple ? [] : "")}
        size="small"
        fullWidth
        displayEmpty
        renderValue={(value) => {
          if (value?.length === 0) {
            return view?.placeholder || "";
          }
          if (multiple) {
            return value.map((item) => choiceLabels[item] || item).join(", ");
          }
          return choiceLabels[value] || value;
        }}
        onChange={(e) => onChange(path, e.target.value)}
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
