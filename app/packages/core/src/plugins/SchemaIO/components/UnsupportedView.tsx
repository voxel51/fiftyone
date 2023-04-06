import { CodeBlock } from "@fiftyone/components";
import { Box } from "@mui/material";
import React, { useState } from "react";
import Button from "./Button";
import Header from "./Header";

export default function UnsupportedView(props) {
  const [show, setShow] = useState(false);
  return (
    <Box>
      <Header
        label="Unsupported view"
        divider={show}
        Actions={
          <Button onClick={() => setShow(!show)}>
            {show ? "Hide" : "Show"} details
          </Button>
        }
        sx={{ justifyContent: "left" }}
      />

      {show && (
        <CodeBlock
          language="javascript"
          text={JSON.stringify(props, null, 2)}
        />
      )}
    </Box>
  );
}
