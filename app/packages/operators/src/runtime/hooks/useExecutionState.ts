import { useState } from "react";

type UseExecutionStateReturn = {
  isExecuting: boolean;
  setIsExecuting: (value: boolean) => void;
  clearExecutionState: () => void;
};

/**
 * useExecutionState
 *
 * Manages the execution state of an operator.
 *
 * @returns An object with execution state management functions.
 */
export default function useExecutionState(): UseExecutionStateReturn {
  const [isExecuting, setIsExecuting] = useState<boolean>(false);

  const clearExecutionState = () => {
    setIsExecuting(false);
  };

  return { isExecuting, setIsExecuting, clearExecutionState };
}
