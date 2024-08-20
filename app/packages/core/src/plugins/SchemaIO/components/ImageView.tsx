import { Box } from "@mui/material";
import React from "react";
import HeaderView from "./HeaderView";
import { getComponentProps } from "../utils";

export default function ImageView(props) {
  const { schema, data } = props;
  const { height, width, alt } = schema?.view || {};
  const imageURI = data ?? schema?.default;

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      <img
        src={imageURI}
        height={height}
        width={width}
        alt={alt}
        {...getComponentProps(props, "image")}
      />
    </Box>
  );
}
