import React from "react";
import { Box } from "@mui/material";
import Header from "./Header";
import { CodeBlock } from "@fiftyone/components";

export default function JSONView(props) {
  const { data, schema } = props;
  const { default: defaultValue, view = {} } = schema;
  return (
    <Box>
      <Header {...view} />
      <CodeBlock language="javascript" text={data ?? defaultValue} content />
    </Box>
  );
}
