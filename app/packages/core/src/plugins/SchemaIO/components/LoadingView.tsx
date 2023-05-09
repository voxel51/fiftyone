import LoadingDots from "@fiftyone/components/src/components/Loading/LoadingDots";
import { Box } from "@mui/material";
import React from "react";

export default function LoadingView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { label = "Loading" } = view;

  return (
    <Box>
      <LoadingDots text={label} />
    </Box>
  );
}
