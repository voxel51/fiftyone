import { useState, useCallback } from "react";
import { debounce } from "lodash";
import { ExecutionContext, Operator } from "../operators";

type UseResolveInputReturn = {
  inputFields: any;
  resolveInput: (ctx: ExecutionContext) => void;
  close: () => void;
};

/**
 * useResolveInput
 *
 * Resolves input fields for the operator prompt.
 *
 * @param ctx - The execution context.
 * @param operator - The operator object.
 * @param setPromptingOperator - Function to reset the prompting operator state.
 * @returns An object with the input fields and control functions.
 */
export default function useResolveInput(
  ctx: ExecutionContext,
  operator: Operator,
  setPromptingOperator: (value: any) => void
): UseResolveInputReturn {
  const [inputFields, setInputFields] = useState<any>();

  const resolveInput = useCallback(
    debounce(async (ctx: ExecutionContext) => {
      try {
        const resolved = await operator.resolveInput(ctx);
        setInputFields(resolved ? resolved.toProps() : null);
      } catch (e) {
        setInputFields(null);
      }
    }, 300),
    [operator]
  );

  const close = () => {
    setPromptingOperator(null);
    setInputFields(null);
  };

  return { inputFields, resolveInput, close };
}
