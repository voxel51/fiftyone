import { Box, Link } from "@mui/material";
import React from "react";

export default function LinkView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { label, href } = view;
  return (
    <Box>
      <Link href={href}>{label}</Link>
    </Box>
  );
}
