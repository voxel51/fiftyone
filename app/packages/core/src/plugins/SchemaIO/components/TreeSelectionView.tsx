import { Box, Grid } from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import { getComponentProps, getPath } from "../utils";

export default function TreeSelectionView(props) {
  const { path, schema, data } = props;
  const { view = {}, items } = schema;

  console.log("TreeSelectionView", schema.view.items);

  return <Box {...getComponentProps(props, "container")}></Box>;
}
