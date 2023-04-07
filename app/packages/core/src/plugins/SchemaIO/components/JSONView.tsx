import React from "react";
import { Box } from "@mui/material";
import Header from "./Header";
import { CodeBlock } from "@fiftyone/components";

export default function JSONView(props) {
  const { text, schema } = props;
  const { view = {} } = schema;
  return (
    <Box>
      <Header {...view} />
      <CodeBlock language="javascript" text={text} content />
    </Box>
  );
}
