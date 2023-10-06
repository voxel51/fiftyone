import { Box, ListItemText, Typography } from "@mui/material";
import React from "react";
import { getComponentProps } from "../utils";

export default function ChoiceMenuItemBody(props: ChoiceMenuItemBodyPropsType) {
  const { caption, description, label } = props;
  return (
    <ListItemText
      primary={
        <Typography {...getComponentProps(props, "optionLabel")}>
          {label}
        </Typography>
      }
      secondary={
        description || caption ? (
          <Box>
            {description && (
              <Typography
                variant="body2"
                {...getComponentProps(props, "optionDescription")}
              >
                {description}
              </Typography>
            )}
            {caption && (
              <Typography
                variant="body2"
                color="text.tertiary"
                {...getComponentProps(props, "optionCaption")}
              >
                {caption}
              </Typography>
            )}
          </Box>
        ) : null
      }
      {...getComponentProps(props, "option")}
    />
  );
}

type ChoiceMenuItemBodyPropsType = {
  label: string;
  caption?: string;
  description?: string;
  [key: string]: unknown;
};
