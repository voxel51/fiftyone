import React from "react";
import { Box, Stack, Typography } from "@mui/material";

export default function LabelValueView(props) {
  const { data, schema } = props;
  const { view = {} } = schema;
  const { label } = view;
  return (
    <Box>
      <Stack direction="row" spacing={1}>
        {/* todo: add description and caption */}
        <Typography color="text.secondary">{label || schema?.id}:</Typography>
        <Typography>{data?.toString() || "No value provided"}</Typography>
      </Stack>
    </Box>
  );
}
