import { CodeBlock } from "@fiftyone/components";
import { Box } from "@mui/material";
import React, { useState } from "react";
import Button from "./Button";
import HeaderView from "./HeaderView";

export default function UnsupportedView(props) {
  const [show, setShow] = useState(false);
  return (
    <Box>
      <HeaderView
        schema={{ view: { label: "Unsupported view" } }}
        divider={show}
        Actions={
          <Button onClick={() => setShow(!show)}>
            {show ? "Hide" : "Show"} details
          </Button>
        }
        sx={{ justifyContent: "left" }}
        nested
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
