import { Button } from "@mui/material";
import { OperatorExecutionTrigger } from "../OperatorExecutionTrigger";
import React, { useCallback, useMemo } from "react";
import {
  ExecutionCallback,
  ExecutionErrorCallback,
  OperatorExecutorOptions,
} from "../../types-internal";
import {
  OperatorExecutionOption,
  useOperatorExecutionOptions,
  useOperatorExecutor,
  usePromptOperatorInput,
} from "../../state";

/**
 * Button which acts as a trigger for opening an `OperatorExecutionMenu`.
 *
 * @param operatorUri Operator URI
 * @param onSuccess Callback for successful operator execution
 * @param onError Callback for operator execution error
 * @param executionParams Parameters to provide to the operator's execute call
 * @param onOptionSelected Callback for execution option selection
 * @param disabled If true, disables the button and context menu
 * @param executorOptions Operator executor options
 */
export const OperatorExecutionButton = ({
  operatorUri,
  onSuccess,
  onError,
  onClick,
  onCancel,
  executionParams,
  onOptionSelected,
  prompt,
  disabled,
  children,
  executorOptions,
  ...props
}: {
  operatorUri: string;
  onSuccess?: ExecutionCallback;
  onError?: ExecutionErrorCallback;
  onClick?: () => void;
  onCancel?: () => void;
  prompt?: boolean;
  executionParams?: object;
  onOptionSelected?: (option: OperatorExecutionOption) => void;
  disabled?: boolean;
  children: React.ReactNode;
  executorOptions?: OperatorExecutorOptions;
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

  const { executionOptions } = useOperatorExecutionOptions({
    operatorUri,
    onExecute,
  });

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
      onCancel={onCancel}
      prompt={prompt}
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
