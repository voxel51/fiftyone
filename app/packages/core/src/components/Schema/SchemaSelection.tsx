import React from "react";
import { Box } from "@mui/material";

interface Props {
  test?: boolean;
}

export const SchemaSelection = (props: Props) => {
  const { test } = props;

  return (
    <Box style={{ display: "flex", position: "relative" }}>Field Selection</Box>
  );
};
