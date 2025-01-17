import React, { useCallback, useMemo, useRef, useState } from "react";
import { Box } from "@mui/material";
import { OperatorExecutionMenu } from "../OperatorExecutionMenu";
import {
  ExecutionCallback,
  ExecutionErrorCallback,
  OperatorExecutorOptions,
} from "../../types-internal";
import {
  OperatorExecutionOption,
  useOperatorExecutionOptions,
  useOperatorExecutor,
} from "../../state";

/**
 * Component which acts as a trigger for opening an `OperatorExecutionMenu`.
 *
 * This component is meant to act as a wrapper around the interactable
 * component. For example, if you wanted to add operator execution to a button,
 *
 * ```tsx
 * <OperatorExecutionTrigger {...props}>
 *   <Button>Execute operator</Button>
 * </OperatorExecutionTrigger>
 * ```
 *
 *
 * This component registers a click handler which will manage the
 * `OperatorExecutionMenu` lifecycle.
 *
 * @param operatorUri Operator URI
 * @param onClick Callback for click events
 * @param onSuccess Callback for successful operator execution
 * @param onError Callback for operator execution error
 * @param executionParams Parameters to provide to the operator's execute call
 * @param executorOptions Operator executor options
 * @param onOptionSelected Callback for execution option selection
 * @param disabled If true, context menu will never open
 */
export const OperatorExecutionTrigger = ({
  operatorUri,
  onClick,
  onSuccess,
  onError,
  executionParams,
  executorOptions,
  onOptionSelected,
  disabled,
  children,
  ...props
}: {
  operatorUri: string;
  children: React.ReactNode;
  onClick?: () => void;
  onSuccess?: ExecutionCallback;
  onError?: ExecutionErrorCallback;
  executionParams?: object;
  executorOptions?: OperatorExecutorOptions;
  onOptionSelected?: (option: OperatorExecutionOption) => void;
  disabled?: boolean;
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Anchor to use for context menu
  const containerRef = useRef(null);

  // Pass onSuccess and onError through to the operator executor.
  // These will be invoked on operator completion.
  const operatorHandlers = useMemo(() => {
    return { onSuccess, onError };
  }, [onSuccess, onError]);
  const operator = useOperatorExecutor(operatorUri, operatorHandlers);

  // This callback will be invoked when an execution target option is clicked
  const onExecute = useCallback(
    (options?: OperatorExecutorOptions) => {
      const resolvedOptions = {
        ...executorOptions,
        ...options,
      };

      return operator.execute(executionParams ?? {}, resolvedOptions);
    },
    [executorOptions, operator, executionParams]
  );

  const { executionOptions } = useOperatorExecutionOptions({
    operatorUri,
    onExecute,
  });

  // Click handler controls the state of the context menu.
  const clickHandler = useCallback(() => {
    if (disabled) {
      setIsMenuOpen(false);
    } else {
      onClick?.();
      setIsMenuOpen(true);
    }
  }, [setIsMenuOpen, onClick, disabled]);

  return (
    <>
      <Box ref={containerRef} onClick={clickHandler} {...props}>
        {children}
      </Box>

      <OperatorExecutionMenu
        anchor={containerRef.current}
        open={isMenuOpen && !disabled}
        onClose={() => setIsMenuOpen(false)}
        onOptionClick={onOptionSelected}
        executionOptions={executionOptions}
      />
    </>
  );
};

export default OperatorExecutionTrigger;
