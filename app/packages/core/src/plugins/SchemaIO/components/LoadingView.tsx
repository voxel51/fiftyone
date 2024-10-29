import LoadingDots from "@fiftyone/components/src/components/Loading/LoadingDots";
import LoadingSpinner from "@fiftyone/components/src/components/Loading/LoadingSpinner";
import { Box } from "@mui/material";
import React from "react";
import { getComponentProps } from "../utils";

export default function LoadingView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { text = "Loading", variant, color, size } = view;

  return (
    <Box {...getComponentProps(props, "container")}>
      {variant === "spinner" ? (
        <LoadingSpinner color={color} size={size} />
      ) : (
        <LoadingDots text={text} {...getComponentProps(props, "loading")} />
      )}
    </Box>
  );
}
