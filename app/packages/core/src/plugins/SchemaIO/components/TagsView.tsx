import React from "react";
import { Box, Chip } from "@mui/material";
import Header from "./Header";

export default function TagsView(props) {
  const { data, path, schema } = props;
  const { view } = schema;
  return (
    <Box>
      <Header {...view} divider />
      {data.map((item, i) => (
        <Chip key={`${path}-${i}`} label={item.toString()} sx={{ m: 0.25 }} />
      ))}
    </Box>
  );
}
