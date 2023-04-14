import { Box } from "@mui/material";
import React from "react";
import Header from "./Header";

export default function HeadingView(props) {
  const { schema } = props;
  const { view = {} } = schema;

  return (
    <Box>
      <Header {...view} />
    </Box>
  );
}
