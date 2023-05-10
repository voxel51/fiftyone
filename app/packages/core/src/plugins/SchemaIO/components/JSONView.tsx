import { CodeBlock } from "@fiftyone/components";
import { Box } from "@mui/material";
import React from "react";
import { HeaderView } from ".";

export default function JSONView(props) {
  const { data, schema } = props;
  const { default: defaultValue } = schema;
  return (
    <Box>
      <HeaderView {...props} />
      <CodeBlock language="javascript" text={data ?? defaultValue} content />
    </Box>
  );
}
