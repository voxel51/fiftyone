import { Box, Chip } from "@mui/material";
import React from "react";
import HeaderView from "./HeaderView";
import { getComponentProps } from "../utils";

export default function TagsView(props) {
  const { data, path } = props;

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} divider nested />
      {data.map((item, i) => (
        <Chip
          key={`${path}-${i}`}
          label={item.toString()}
          sx={{ m: 0.25 }}
          {...getComponentProps(props, "tag")}
        />
      ))}
    </Box>
  );
}
