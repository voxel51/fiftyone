import { useCallback, useState } from "react";
import { ExecutionContext, Operator, ValidationContext } from "../operators";
import { debounce } from "lodash";

type UseValidateInputsReturn = {
  validationErrors: any[];
  validateThrottled: (ctx: ExecutionContext, resolved: any) => void;
};

/**
 * useValidateInputs
 *
 * Validates operator inputs.
 *
 * @param operator - The operator object.
 * @returns An object with validation errors and throttled validation function.
 */
export default function useValidateInputs(
  operator: Operator
): UseValidateInputsReturn {
  const [validationErrors, setValidationErrors] = useState<any[]>([]);

  const validateThrottled = useCallback(
    debounce((ctx: ExecutionContext, resolved: any) => {
      const validationContext = new ValidationContext(ctx, resolved, operator);
      const errors = validationContext.toProps().errors;
      setValidationErrors(errors);
    }, 300),
    [operator]
  );

  return { validationErrors, validateThrottled };
}
