import { Box, Link } from "@mui/material";
import React from "react";
import { getComponentProps } from "../utils";

export default function LinkView(props) {
  const { schema, data = {} } = props;
  const { view = {} } = schema;
  const { label: viewLabel, href: viewHref } = view;
  const { label, href } = data;
  return (
    <Box {...getComponentProps(props, "container")}>
      <Link href={href || viewHref} {...getComponentProps(props, "link")}>
        {label || viewLabel}
      </Link>
    </Box>
  );
}
