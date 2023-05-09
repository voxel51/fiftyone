import { Box, Chip } from "@mui/material";
import React from "react";
import HeaderView from "./HeaderView";

export default function TagsView(props) {
  const { data, path, schema } = props;

  return (
    <Box>
      <HeaderView {...props} divider />
      {data.map((item, i) => (
        <Chip key={`${path}-${i}`} label={item.toString()} sx={{ m: 0.25 }} />
      ))}
    </Box>
  );
}
