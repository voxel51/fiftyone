import { Box } from "@mui/material";
import React from "react";
import Header from "./Header";
import { getErrorsForView } from "../utils";

export default function HeaderView(props) {
  const { schema, errors, nested, ...otherProps } = props;
  const { view = {} } = schema;
  const { componentsProps } = view;
  const { sx, ...viewWithoutSx } = view;

  return (
    <Box>
      <Header
        errors={getErrorsForView(props)}
        {...viewWithoutSx}
        {...otherProps}
        componentsProps={nested ? componentsProps?.header : componentsProps}
      />
    </Box>
  );
}
