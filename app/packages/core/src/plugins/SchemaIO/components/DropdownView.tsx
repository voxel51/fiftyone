import React from "react";
import { Box, Typography, Select, MenuItem, ListItemText } from "@mui/material";
import FieldWrapper from "./FieldWrapper";

export default function DropdownView(props) {
  const { onChange, schema, path } = props;
  const { view = {} } = schema;
  const { choices } = view;

  const choiceLabels = choices.reduce((labels, choice) => {
    labels[choice.value] = choice.label;
    return labels;
  }, {});

  return (
    <FieldWrapper {...props}>
      <Select
        value={schema.default}
        size="small"
        fullWidth
        renderValue={(value) => choiceLabels[value]}
        onChange={(e) => onChange(path, e.target.value)}
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
