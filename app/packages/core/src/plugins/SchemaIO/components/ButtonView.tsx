import React from "react";
import { Box } from "@mui/material";
import { useOperatorExecutor } from "@fiftyone/operators";
import Button from "./Button";
import { getComponentProps } from "../utils";
import { useCustomPanelState, usePanelId } from "@fiftyone/spaces";
import { usePromptOperatorInput } from "@fiftyone/operators/src/state";
import usePanelEvent from "@fiftyone/operators/src/usePanelEvent";

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
  let { operator, params = {}, prompt } = props.schema.view;
  const panelState = useCustomPanelState();
  const panelId = usePanelId();
  const handleClick = usePanelEvent();
  return (
    <BaseButtonView
      {...props}
      onClick={() => {
        handleClick(panelId, { params, operator, prompt });
      }}
    />
  );
}
