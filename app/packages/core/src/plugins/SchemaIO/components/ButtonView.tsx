import usePanelEvent from "@fiftyone/operators/src/usePanelEvent";
import { usePanelId } from "@fiftyone/spaces";
import { Box } from "@mui/material";
import React from "react";
import { getComponentProps } from "../utils";
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
  const { label, href, variant } = view;
  return (
    <Box {...getComponentProps(props, "container")}>
      <Button
        variant={variant || "contained"}
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
  const path = props.path;
  let { operator, params = {}, prompt } = props.schema.view;
  const panelId = usePanelId();
  const handleClick = usePanelEvent();
  return (
    <BaseButtonView
      {...props}
      onClick={() => {
        params = { ...params, path };
        handleClick(panelId, { params, operator, prompt });
      }}
    />
  );
}
