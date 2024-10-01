import { Markdown } from "@fiftyone/components";
import { Box } from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import { getComponentProps } from "../utils";
import { ViewPropsType } from "../utils/types";

export default function MarkdownView(props: ViewPropsType) {
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
