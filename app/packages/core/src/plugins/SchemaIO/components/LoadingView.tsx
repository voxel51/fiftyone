import LoadingDots from "@fiftyone/components/src/components/Loading/LoadingDots";
import { Box } from "@mui/material";
import React from "react";
import { getComponentProps } from "../utils";

export default function LoadingView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { label = "Loading" } = view;

  return (
    <Box {...getComponentProps(props, "container")}>
      <LoadingDots text={label} {...getComponentProps(props, "loading")} />
    </Box>
  );
}
