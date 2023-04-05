import React from "react";
import { Box, Link } from "@mui/material";

export default function LinkView(props) {
  const { href, label } = props;
  return (
    <Box>
      <Link href={href}>{label}</Link>
    </Box>
  );
}
