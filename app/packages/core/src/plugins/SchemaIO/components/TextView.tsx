import { Box, Typography } from "@mui/material";
import React from "react";
import { getComponentProps } from "../utils";
import { NumberSchemaType, ViewPropsType } from "../utils/types";

export default function TextView(props: ViewPropsType<NumberSchemaType>) {
  const { schema } = props;
  const { view = {} } = schema;
  const {
    color = "primary",
    fontSize = "1rem",
    title = "",
    textTransform = "none",
    variant = "body1",
    bold = false,
    italic = false,
    align = "inherit",
    noWrap = false,
    textDecoration = "none",
    letterSpacing = "normal",
    lineHeight = "normal",
    fontFamily = "default",
    width = "auto",
    displayMode = "block",
    padding = "1rem",
  } = view;

  const sx = {
    fontFamily,
    ...(bold ? { fontWeight: "bold" } : {}),
    ...(italic ? { fontStyle: "italic" } : {}),
    ...(noWrap
      ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
      : {}),
  };

  return (
    <Box {...getComponentProps(props, "container")}>
      <Typography
        padding={padding}
        display={displayMode}
        width={width}
        variant={variant}
        color={color}
        fontSize={fontSize}
        textTransform={textTransform}
        align={align}
        letterSpacing={letterSpacing}
        noWrap={noWrap}
        lineHeight={lineHeight}
        textDecoration={textDecoration}
        sx={sx}
        {...getComponentProps(props, "text")}
      >
        {title}
      </Typography>
    </Box>
  );
}
