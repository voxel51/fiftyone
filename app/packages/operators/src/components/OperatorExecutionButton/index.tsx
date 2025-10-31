import { Button } from "@mui/material";
import { OperatorExecutionTrigger } from "../OperatorExecutionTrigger";
import React from "react";
import {
  ExecutionCallback,
  ExecutionErrorCallback,
} from "../../types-internal";
import { OperatorExecutionOption } from "../../state";

/**
 * Button which acts as a trigger for opening an `OperatorExecutionMenu`.
 *
 * @param operatorUri Operator URI
 * @param onSuccess Callback for successful operator execution
 * @param onError Callback for operator execution error
 * @param executionParams Parameters to provide to the operator's execute call
 * @param onOptionSelected Callback for execution option selection
 * @param disabled If true, disables the button and context menu
 * @param insideModal If true, elevate menu z-index to appear above modals
 * @param menuAnchorOrigin Controls where the menu attaches to the button
 * @param menuTransformOrigin Controls which point of the menu aligns with button
 */
export const OperatorExecutionButton = ({
  operatorUri,
  onSuccess,
  onError,
  onClick,
  executionParams,
  onOptionSelected,
  disabled,
  insideModal,
  menuAnchorOrigin,
  menuTransformOrigin,
  children,
  ...props
}: {
  operatorUri: string;
  onSuccess?: ExecutionCallback;
  onError?: ExecutionErrorCallback;
  onClick?: () => void;
  executionParams?: object;
  onOptionSelected?: (option: OperatorExecutionOption) => void;
  disabled?: boolean;
  insideModal?: boolean;
  menuAnchorOrigin?: {
    vertical: "top" | "bottom" | "center";
    horizontal: "left" | "right" | "center";
  };
  menuTransformOrigin?: {
    vertical: "top" | "bottom" | "center";
    horizontal: "left" | "right" | "center";
  };
  children: React.ReactNode;
}) => {
  return (
    <OperatorExecutionTrigger
      operatorUri={operatorUri}
      onClick={onClick}
      onSuccess={onSuccess}
      onError={onError}
      executionParams={executionParams}
      onOptionSelected={onOptionSelected}
      disabled={disabled}
      insideModal={insideModal}
      menuAnchorOrigin={menuAnchorOrigin}
      menuTransformOrigin={menuTransformOrigin}
    >
      <Button disabled={disabled} {...props}>
        {children}
      </Button>
    </OperatorExecutionTrigger>
  );
};

export default OperatorExecutionButton;
