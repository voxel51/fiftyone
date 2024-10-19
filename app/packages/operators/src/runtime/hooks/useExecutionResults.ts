import { useState } from "react";
import { OperatorResult } from "../operators";

type UseExecutionResultsReturn = {
  result: OperatorResult | null;
  error: Error | null;
  setResult: (result: OperatorResult | null) => void;
  setError: (error: Error | null) => void;
  hasResultOrError: boolean;
  isDelegated: boolean;
  setIsDelegated: (value: boolean) => void;
  clearResults: () => void;
};

/**
 * useExecutionResults
 *
 * Manages the execution results and errors.
 *
 * @returns An object with result and error management functions.
 */
export default function useExecutionResults(): UseExecutionResultsReturn {
  const [result, setResult] = useState<OperatorResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isDelegated, setIsDelegated] = useState<boolean>(false);

  const clearResults = () => {
    setResult(null);
    setError(null);
    setIsDelegated(false);
  };

  return {
    result,
    error,
    setResult,
    setError,
    hasResultOrError: !!result || !!error,
    isDelegated,
    setIsDelegated,
    clearResults,
  };
}
