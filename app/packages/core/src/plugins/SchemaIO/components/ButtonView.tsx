import React from "react";
import { Box } from "@mui/material";
import { useOperatorExecutor } from "@fiftyone/operators";
import Button from "./Button";

export default function ButtonView(props) {
  const { href, label, operator } = props;
  const operatorExecutor = useOperatorExecutor(operator);
  return (
    <Box>
      <Button
        variant="contained"
        href={href}
        onClick={() => {
          operatorExecutor.execute({});
        }}
      >
        {label}
      </Button>
    </Box>
  );
}
