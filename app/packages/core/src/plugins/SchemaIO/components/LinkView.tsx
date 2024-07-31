import { Box, Link } from "@mui/material";
import React from "react";
import { getComponentProps } from "../utils";

export default function LinkView(props) {
  const { schema, data = {} } = props;
  const { view = {}, default: defaultValue } = schema;
  const { new_window, newWindow } = view;
  let { label, href } = view;
  const value = data ?? defaultValue;
  if (typeof value === "string") {
    href = value;
  } else {
    if (value?.href) {
      href = value.href;
    }
    if (value?.label) {
      label = value.label;
    }
  }
  return (
    <Box {...getComponentProps(props, "container")}>
      <Link
        href={href}
        target={new_window || newWindow ? "_blank" : undefined}
        {...getComponentProps(props, "link")}
      >
        {label}
      </Link>
    </Box>
  );
}
