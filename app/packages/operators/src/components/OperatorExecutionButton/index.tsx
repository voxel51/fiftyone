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
  // Pass onSuccess and onError through to the operator executor.
  // These will be invoked on operator completion.
  const operatorHandlers = useMemo(() => {
    return { onSuccess, onError };
  }, [onSuccess, onError]);
  const operator = useOperatorExecutor(operatorUri, operatorHandlers);
  const promptForOperator = usePromptOperatorInput();

  // This callback will be invoked when an execution target option is clicked
  const onExecute = useCallback(
    (options?: OperatorExecutorOptions) => {
      const resolvedOptions = {
        ...executorOptions,
        ...options,
      };

      if (prompt) {
        promptForOperator(operatorUri, executionParams, {
          callback: (result, opts) => {
            if (result?.error) {
              onError?.(result, opts);
            } else {
              onSuccess?.(result, opts);
            }
          },
          onCancel,
        });
      } else {
        return operator.execute(executionParams ?? {}, resolvedOptions);
      }
    },
    [executorOptions, operator, executionParams]
  );

  const { executionOptions, warningMessage, showWarning, isLoading } =
    useOperatorExecutionOptions({
      operatorUri,
      onExecute,
    });

  if (isLoading) return null;

  if (disabled) {
    return (
      <Button disabled {...props} variant={props.variant}>
        {children}
      </Button>
    );
  }

  if (showWarning) {
    return (
      <TooltipProvider title={warningMessage}>
        <Button disabled={true} variant={props.variant}>
          {children}
        </Button>
      </TooltipProvider>
    );
  }

  if (prompt) {
    return (
      <Button disabled={disabled} {...props} onClick={onExecute}>
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
