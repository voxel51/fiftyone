import { Box, Chip } from "@mui/material";
import React from "react";
import HeaderView from "./HeaderView";
import { getComponentProps } from "../utils";

export default function TagsView(props) {
  const { data, path, schema } = props;
  const defaultValue = schema.default;
  const tags = Array.isArray(data)
    ? data
    : Array.isArray(defaultValue)
    ? defaultValue
    : [];

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} divider nested />
      {tags.map((item, i) => (
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
