import React from "react";
import { Box, Typography, Select, MenuItem, ListItemText } from "@mui/material";
import FieldWrapper from "./FieldWrapper";

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
      >
        {choices.map(({ value, label, description, caption }) => (
          <MenuItem key="value" value={value}>
            <ListItemText
              primary={<Typography>{label}</Typography>}
              secondary={
                <Box>
                  <Typography variant="body2">{description}</Typography>
                  <Typography variant="body2" color="text.tertiary">
                    {caption}
                  </Typography>
                </Box>
              }
            />
          </MenuItem>
        ))}
      </Select>
    </FieldWrapper>
  );
}
