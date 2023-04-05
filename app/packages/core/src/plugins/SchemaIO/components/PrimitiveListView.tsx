import React from "react";
import { Box, Chip } from "@mui/material";
import Header from "./Header";

export default function PrimitiveListView(props) {
  const { data, schema } = props;
  const { view } = schema;
  return (
    <Box>
      <Header {...view} divider />
      {data.map(({ id, label }) => (
        <Chip key={id} label={label} sx={{ mx: 0.25 }} />
      ))}
    </Box>
  );
}
