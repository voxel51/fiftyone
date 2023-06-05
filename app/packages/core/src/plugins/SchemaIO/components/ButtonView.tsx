import React from "react";
import { Box } from "@mui/material";
import { useOperatorExecutor } from "@fiftyone/operators";
import Button from "./Button";
import { getComponentProps } from "../utils";

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
    <Box {...getComponentProps(props, "container")}>
      <Button
        variant="contained"
        href={href}
        onClick={onClick}
        {...getComponentProps(props, "button")}
      >
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
