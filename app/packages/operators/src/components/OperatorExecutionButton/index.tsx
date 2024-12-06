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
 */
export const OperatorExecutionButton = ({
  operatorUri,
  onSuccess,
  onError,
  onClick,
  executionParams,
  onOptionSelected,
  disabled,
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
  children: React.ReactNode;
}) => {
  if (disabled) {
    return (
      <Button disabled {...props}>
        {children}
      </Button>
    );
  }

  return (
    <OperatorExecutionTrigger
      operatorUri={operatorUri}
      onClick={onClick}
      onSuccess={onSuccess}
      onError={onError}
      executionParams={executionParams}
      onOptionSelected={onOptionSelected}
      disabled={disabled}
    >
      <Button disabled={disabled} {...props}>
        {children}
      </Button>
    </OperatorExecutionTrigger>
  );
};

export default OperatorExecutionButton;
