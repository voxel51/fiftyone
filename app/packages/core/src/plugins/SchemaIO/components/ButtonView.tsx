import React from "react";
import { Box } from "@mui/material";
import { useOperatorExecutor } from "@fiftyone/operators";
import Button from "./Button";
import { getComponentProps } from "../utils";
import { useCustomPanelState, usePanelId } from "@fiftyone/spaces";
import { usePromptOperatorInput } from "@fiftyone/operators/src/state";

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
  const panel_state = useCustomPanelState();
  const operatorExecutor = useOperatorExecutor(operator);
  const promptForOperator = usePromptOperatorInput();
  const panelId = usePanelId();
  return (
    <BaseButtonView
      {...props}
      onClick={() => {
        const actualParams = {
          panel_id: panelId,
          panel_state,
          ...params,
        };
        if (props.schema.view.prompt) {
          promptForOperator(operator, actualParams);
        } else {
          operatorExecutor.execute(actualParams);
        }
      }}
    />
  );
}
