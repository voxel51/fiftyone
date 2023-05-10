import { Box } from "@mui/material";
import React from "react";
import Header from "./Header";
import { getErrorsForView } from "../utils";

export default function HeaderView(props) {
  const { schema, errors, ...otherProps } = props;
  const { view = {} } = schema;

  return (
    <Box>
      <Header errors={getErrorsForView(props)} {...view} {...otherProps} />
    </Box>
  );
}
