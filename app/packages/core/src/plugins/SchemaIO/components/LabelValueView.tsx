import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { getComponentProps } from "../utils";

export default function LabelValueView(props) {
  const { data, schema } = props;
  const { view = {} } = schema;
  const { label } = view;
  return (
    <Box {...getComponentProps(props, "container")}>
      <Stack direction="row" spacing={1} {...getComponentProps(props, "stack")}>
        {/* todo: add description and caption */}
        <Typography
          color="text.secondary"
          {...getComponentProps(props, "label")}
        >
          {label || schema?.id}:
        </Typography>
        <Typography {...getComponentProps(props, "value")}>
          {data?.toString() || "No value provided"}
        </Typography>
      </Stack>
    </Box>
  );
}
