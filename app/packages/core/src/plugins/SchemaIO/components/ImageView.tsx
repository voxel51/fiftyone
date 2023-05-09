import { Box } from "@mui/material";
import React from "react";
import HeaderView from "./HeaderView";

export default function ImageView(props) {
  const { schema, data } = props;
  const { view = {} } = schema;
  const imageURI = data ?? schema?.default;
  const { image = {} } = view;

  return (
    <Box>
      <HeaderView {...props} />
      <img src={imageURI} {...image} />
    </Box>
  );
}
