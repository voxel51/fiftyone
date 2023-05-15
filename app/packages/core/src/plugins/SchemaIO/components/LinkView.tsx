import { Box, Link } from "@mui/material";
import React from "react";

export default function LinkView(props) {
  const { schema, data = {} } = props;
  const { view = {} } = schema;
  const { label: viewLabel, href: viewHref } = view;
  const { label, href } = data;
  return (
    <Box>
      <Link href={href || viewHref}>{label || viewLabel}</Link>
    </Box>
  );
}
