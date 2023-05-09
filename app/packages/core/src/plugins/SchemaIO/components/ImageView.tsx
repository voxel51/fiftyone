import { Box } from "@mui/material";
import React from "react";
import HeaderView from "./HeaderView";

export default function ImageView(props) {
  const { schema, data } = props;
  const imageURI = data ?? schema?.default;

  return (
    <Box>
      <HeaderView {...props} />
      <img src={imageURI} />
    </Box>
  );
}
