import { useRecoilState, useRecoilTransaction_UNSTABLE } from "recoil";
import { promptingOperatorState } from "../recoil";
import useExecutionContext from "./useExecutionContext";
import { getLocalOrRemoteOperator, OperatorResult } from "../operators";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useExecutionOptions from "./useExecutionOptions";
import useOperatorExecutor from "./useOperatorExecutor";
import * as fos from "@fiftyone/state";
import { debounce } from "lodash";
import {
  RESOLVE_INPUT_VALIDATION_TTL,
  RESOLVE_TYPE_TTL,
} from "../../constants";
import { ValidationContext } from "../../validation";
import useOperatorPromptSubmitOptions from "./useOperatorPromptSubmitOptions";

/**
 * useOperatorPrompt
 *
 * Manages the operator prompt's execution context and state.
 *
 * @returns An object with control functions and state for the operator prompt.
 */
export default function useOperatorPrompt() {
  const [promptingOperator, setPromptingOperator] = useRecoilState(
    promptingOperatorState
  );
  const containerRef = useRef();
  const resolveTypeError = useRef();
  const { operatorName } = promptingOperator;
  const ctx = useExecutionContext(operatorName);
  const { operator, isRemote } = getLocalOrRemoteOperator(operatorName);
  const execDetails = useExecutionOptions(operatorName, ctx, isRemote);
  const hooks = operator.useHooks(ctx);
  const executor = useOperatorExecutor(promptingOperator.operatorName);
  const [inputFields, setInputFields] = useState();
  const [resolving, setResolving] = useState(false);
  const [resolvedCtx, setResolvedCtx] = useState(null);
  const [resolvedIO, setResolvedIO] = useState({ input: null, output: null });
  const notify = fos.useNotification();
  const isDynamic = useMemo(() => Boolean(operator.config.dynamic), [operator]);
  const cachedResolvedInput = useMemo(() => {
    return isDynamic ? null : resolvedIO.input;
  }, [isDynamic, resolvedIO.input]);
  const promptView = useMemo(() => {
    return inputFields?.view;
  }, [inputFields]);

  const resolveInput = useCallback(
    debounce(
      async (ctx) => {
        try {
          setResolving(true);
          if (operator.config.resolveExecutionOptionsOnChange) {
            execDetails.fetch(ctx);
          }
          const resolved =
            cachedResolvedInput || (await operator.resolveInput(ctx));

          validateThrottled(ctx, resolved);
          if (resolved) {
            setInputFields(resolved.toProps());
            setResolvedIO((state) => ({ ...state, input: resolved }));
          } else {
            setInputFields(null);
          }
        } catch (e) {
          resolveTypeError.current = e;
          setInputFields(null);
        }
        setResolving(false);
        setResolvedCtx(ctx);
      },
      operator.isRemote ? RESOLVE_TYPE_TTL : 0,
      { leading: true }
    ),
    [cachedResolvedInput, setResolvedCtx, operator.uri]
  );
  const resolveInputFields = useCallback(async () => {
    ctx.hooks = hooks;
    resolveInput(ctx);
  }, [ctx, operatorName, hooks, JSON.stringify(ctx.params)]);

  const validate = useCallback((ctx, resolved) => {
    return new Promise<{
      invalid: boolean;
      errors: any;
      validationContext: any;
    }>((resolve) => {
      setTimeout(() => {
        const validationContext = new ValidationContext(
          ctx,
          resolved,
          operator
        );
        const validationErrors = validationContext.toProps().errors;
        setValidationErrors(validationErrors);
        resolve({
          invalid: validationContext.invalid,
          errors: validationErrors,
          validationContext,
        });
      }, 0);
    });
  }, []);
  const validateThrottled = useCallback(
    debounce(validate, RESOLVE_INPUT_VALIDATION_TTL, { leading: true }),
    []
  );

  useEffect(() => {
    if (executor.isExecuting || executor.hasExecuted) return;
    resolveInputFields();
  }, [ctx.params, executor.isExecuting, executor.hasResultOrError]);
  const [validationErrors, setValidationErrors] = useState([]);

  const [outputFields, setOutputFields] = useState();
  const resolveOutputFields = useCallback(async () => {
    ctx.hooks = hooks;
    const result = new OperatorResult(operator, executor.result, null, null);
    const resolved = await operator.resolveOutput(ctx, result);

    if (resolved) {
      setOutputFields(resolved.toProps());
    } else {
      setOutputFields(null);
    }
  }, [ctx, operatorName, hooks, JSON.stringify(executor.result)]);

  useEffect(() => {
    if (executor.result) {
      resolveOutputFields();
    }
  }, [executor.result]);

  const setFieldValue = useRecoilTransaction_UNSTABLE(
    ({ get, set }) =>
      (fieldName, value) => {
        const state = get(promptingOperatorState);
        set(promptingOperatorState, {
          ...state,
          params: {
            ...state.params,
            [fieldName]: value,
          },
        });
      }
  );
  const execute = useCallback(
    async (options = {}) => {
      const resolved =
        cachedResolvedInput || (await operator.resolveInput(ctx));
      const { invalid } = await validate(ctx, resolved);
      if (invalid) {
        return;
      }
      executor.execute(promptingOperator.params, {
        ...promptingOperator.options,
      });
    },
    [operator, promptingOperator, cachedResolvedInput]
  );
  const close = () => {
    setPromptingOperator(null);
    setInputFields(null);
    setOutputFields(null);
    executor.clear();
  };

  const autoExec = async () => {
    const needsInput = operator && (await operator.needsUserInput(ctx));
    const needsResolution = operator && operator.needsResolution();
    if (!needsInput && !needsResolution) {
      execute();
    }
  };

  useEffect(() => {
    autoExec();
  }, [operator]);

  const isExecuting = executor && executor.isExecuting;
  const hasResultOrError = executor.hasResultOrError;
  const showPrompt = inputFields && !isExecuting && !hasResultOrError;
  const executorError = executor.error;
  const resolveError = resolveTypeError.current;

  useEffect(() => {
    if (executor.hasExecuted && !executor.needsOutput && !executorError) {
      close();
      if (executor.isDelegated) {
        notify({ msg: "Operation successfully scheduled", variant: "success" });
      }
    }
  }, [
    executor.hasExecuted,
    executor.needsOutput,
    executorError,
    executor.isDelegated,
    close,
    notify,
  ]);

  const pendingResolve = useMemo(
    () => ctx.params != resolvedCtx?.params,
    [ctx.params, resolvedCtx?.params]
  );

  const submitOptions = useOperatorPromptSubmitOptions({
    operatorURI: operator.uri,
    execDetails,
    execute,
    promptView,
  });

  const onSubmit = useCallback(
    (e) => {
      if (e) e.preventDefault();
      submitOptions.handleSubmit();
    },
    [submitOptions?.handleSubmit]
  );

  if (!promptingOperator) return null;

  return {
    containerRef,
    onSubmit,
    inputFields,
    outputFields,
    promptingOperator,
    setFieldValue,
    operator,
    execute,
    executor,
    showPrompt,
    isExecuting,
    hasResultOrError,
    close,
    cancel: close,
    validationErrors,
    validate,
    validateThrottled,
    executorError,
    resolveError,
    resolving,
    pendingResolve,
    execDetails,
    submitOptions,
    promptView,
    resolvedIO,
  };
}
