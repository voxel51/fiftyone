import { Box } from "@mui/material";
import React, { useCallback } from "react";
import { usePromptOperatorInput } from "../../state";

/**
 * Wrapper that opens an operator's input prompt when its child is clicked,
 * optionally pre-seeded with initial parameter values.
 *
 * This component is meant to act as a wrapper around the interactable
 * component, mirroring `OperatorExecutionTrigger`:
 *
 * ```tsx
 * <OperatorPromptTrigger operatorUri="@voxel51/io/import_samples" params={{ import_from: "local" }}>
 *   <Button>Import</Button>
 * </OperatorPromptTrigger>
 * ```
 *
 * @param operatorUri Operator URI
 * @param params Initial parameter values used to seed the operator's input prompt
 * @param onClick Callback for click events
 */
export const OperatorPromptTrigger = ({
  operatorUri,
  params,
  onClick,
  children,
  ...props
}: {
  operatorUri: string;
  params?: object;
  onClick?: () => void;
  children: React.ReactNode;
}) => {
  const promptForInput = usePromptOperatorInput();

  const handleClick = useCallback(() => {
    onClick?.();
    promptForInput(operatorUri, params);
  }, [onClick, promptForInput, operatorUri, params]);

  return (
    <Box onClick={handleClick} {...props}>
      {children}
    </Box>
  );
};

export default OperatorPromptTrigger;
