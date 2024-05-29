import { Box } from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import { getComponentProps } from "../utils";
import Markdown from "./Markdown";

export default function MarkdownView(props) {
  const { data, schema } = props;

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      <Markdown {...getComponentProps(props, "markdown")}>
        {data ?? schema?.default}
      </Markdown>
    </Box>
  );
}
