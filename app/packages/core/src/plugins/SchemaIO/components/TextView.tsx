import { Box, Typography } from "@mui/material";
import React from "react";
import { getComponentProps } from "../utils";
import { NumberSchemaType, ViewPropsType } from "../utils/types";

export default function TextView(props: ViewPropsType<NumberSchemaType>) {
  const { schema } = props;
  const { view = {} } = schema;
  const {
    color = "primary",
    font_size = "1rem",
    title = "",
    text_transform = "none",
    variant = "body1",
    bold = false,
    italic = false,
    align = "inherit",
    no_wrap = false,
    text_decoration = "none",
    letter_spacing = "normal",
    line_height = "normal",
    font_family = "default",
    width = "auto",
    display_mode = "block",
    padding = "1rem",
  } = view;

  const sx = {
    font_family,
    ...(bold ? { fontWeight: "bold" } : {}),
    ...(italic ? { fontStyle: "italic" } : {}),
    ...(no_wrap
      ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
      : {}),
  };

  return (
    <Box {...getComponentProps(props, "container")}>
      <Typography
        padding={padding}
        display={display_mode}
        width={width}
        variant={variant}
        color={color}
        fontSize={font_size}
        textTransform={text_transform}
        align={align}
        letterSpacing={letter_spacing}
        noWrap={no_wrap}
        lineHeight={line_height}
        textDecoration={text_decoration}
        sx={sx}
        {...getComponentProps(props, "text")}
      >
        {title}
      </Typography>
    </Box>
  );
}
