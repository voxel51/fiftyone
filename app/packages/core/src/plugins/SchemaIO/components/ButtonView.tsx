import React from "react";
import { Box } from "@mui/material";
import { useOperatorExecutor } from "@fiftyone/operators";
import Button from "./Button";

export default function ButtonView(props) {
  return props?.schema?.view?.operator ? (
    <OperatorButtonView {...props} />
  ) : (
    <BaseButtonView {...props} />
  );
}

function BaseButtonView(props) {
  const { schema, onClick } = props;
  const { view = {} } = schema;
  const { label, href } = view;
  return (
    <Box>
      <Button variant="contained" href={href} onClick={onClick}>
        {label}
      </Button>
    </Box>
  );
}

function OperatorButtonView(props) {
  const { operator, params = {} } = props.schema.view;
  const operatorExecutor = useOperatorExecutor(operator);
  return (
    <BaseButtonView
      {...props}
      onClick={() => {
        operatorExecutor.execute(params);
      }}
    />
  );
}
