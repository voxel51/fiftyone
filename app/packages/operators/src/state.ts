import * as fos from "@fiftyone/state";
import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  atom,
  selector,
  selectorFamily,
  useRecoilCallback,
  useRecoilState,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import {
  BROWSER_CONTROL_KEYS,
  RESOLVE_INPUT_VALIDATION_TTL,
  RESOLVE_TYPE_TTL,
} from "./constants";
import {
  ExecutionContext,
  InvocationRequestQueue,
  OperatorResult,
  executeOperatorWithContext,
  getInvocationRequestQueue,
  getLocalOrRemoteOperator,
  listLocalAndRemoteOperators,
  resolveExecutionOptions,
} from "./operators";
import { Places } from "./types";
import { ValidationContext } from "./validation";

export const promptingOperatorState = atom({
  key: "promptingOperator",
  default: null,
});

export const currentOperatorParamsSelector = selectorFamily({
  key: "currentOperatorParamsSelector",
  get:
    () =>
    ({ get }) => {
      const promptingOperator = get(promptingOperatorState);
      if (!promptingOperator) {
        return {};
      }
      const { params } = promptingOperator;
      return params;
    },
});

export const showOperatorPromptSelector = selector({
  key: "showOperatorPrompt",
  get: ({ get }) => {
    return !!get(promptingOperatorState);
  },
});

export const usePromptOperatorInput = () => {
  const setRecentlyUsedOperators = useSetRecoilState(
    recentlyUsedOperatorsState
  );
  const setPromptingOperator = useSetRecoilState(promptingOperatorState);

  const prompt = (operatorName) => {
    setRecentlyUsedOperators((recentlyUsedOperators) => {
      const update = new Set([operatorName, ...recentlyUsedOperators]);
      return Array.from(update).slice(0, 5);
    });

    setPromptingOperator({ operatorName, params: {} });
  };

  return prompt;
};

const globalContextSelector = selector({
  key: "globalContext",
  get: ({ get }) => {
    const datasetName = get(fos.datasetName);
    const view = get(fos.view);
    const extended = get(fos.extendedStages);
    const filters = get(fos.filters);
    const selectedSamples = get(fos.selectedSamples);
    const selectedLabels = get(fos.selectedLabels);
    const currentSample = get(fos.currentSampleId);
    const viewName = get(fos.viewName);

    return {
      datasetName,
      view,
      extended,
      filters,
      selectedSamples,
      selectedLabels,
      currentSample,
      viewName,
    };
  },
});

const currentContextSelector = selectorFamily({
  key: "currentContextSelector",
  get:
    (operatorName) =>
    ({ get }) => {
      const globalContext = get(globalContextSelector);
      const params = get(currentOperatorParamsSelector(operatorName));
      return {
        ...globalContext,
        params,
      };
    },
});

const useExecutionContext = (operatorName, hooks = {}) => {
  const curCtx = useRecoilValue(currentContextSelector(operatorName));
  const {
    datasetName,
    view,
    extended,
    filters,
    selectedSamples,
    params,
    selectedLabels,
    currentSample,
    viewName,
  } = curCtx;
  const ctx = useMemo(() => {
    return new ExecutionContext(
      params,
      {
        datasetName,
        view,
        extended,
        filters,
        selectedSamples,
        selectedLabels,
        currentSample,
        viewName,
      },
      hooks
    );
  }, [
    params,
    datasetName,
    view,
    extended,
    filters,
    selectedSamples,
    selectedLabels,
    hooks,
    viewName,
    currentSample,
  ]);

  return ctx;
};

function useExecutionOptions(operatorURI, ctx, isRemote) {
  const [isLoading, setIsLoading] = useState(true);
  const [executionOptions, setExecutionOptions] = useState(null);

  const fetch = useCallback(
    debounce(async (ctxOverride = null) => {
      if (!isRemote) return;
      if (!ctxOverride) setIsLoading(true); // only show loading if loading the first time
      const options = await resolveExecutionOptions(
        operatorURI,
        ctxOverride || ctx
      );
      setExecutionOptions(options);
      setIsLoading(false);
    }),
    [operatorURI, ctx, isRemote]
  );

  useEffect(() => {
    fetch();
  }, []);

  return { isLoading, executionOptions, fetch };
}

const useOperatorPromptSubmitOptions = (operatorURI, execDetails, execute) => {
  let options = [];
  const persistUnderKey = `operator-prompt-${operatorURI}`;
  const availableOrchestrators =
    execDetails.executionOptions?.availableOrchestrators || [];
  const hasAvailableOrchestators = availableOrchestrators.length > 0;
  const executionOptions = execDetails.executionOptions || {};
  const defaultToExecute = executionOptions.allowDelegatedExecution
    ? !executionOptions.defaultChoiceToDelegated
    : true;
  const defaultToSchedule = executionOptions.allowDelegatedExecution
    ? executionOptions.defaultChoiceToDelegated
    : false;
  if (executionOptions.allowImmediateExecution) {
    options.push({
      label: "Execute",
      id: "execute",
      default: defaultToExecute,
      description: "Run this operation now",
      onSelect() {
        setSelectedID("execute");
      },
      onClick() {
        execute();
      },
    });
  }
  if (
    executionOptions.allowDelegatedExecution &&
    !executionOptions.orchestratorRegistrationEnabled
  ) {
    options.push({
      label: "Schedule",
      id: "schedule",
      default: defaultToSchedule,
      description: "Schedule this operation to run later",
      onSelect() {
        setSelectedID("schedule");
      },
      onClick() {
        execute({ requestDelegation: true });
      },
    });
  }

  if (
    executionOptions.allowDelegatedExecution &&
    hasAvailableOrchestators &&
    executionOptions.orchestratorRegistrationEnabled
  ) {
    for (let orc of execDetails.executionOptions.availableOrchestrators) {
      options.push({
        label: "Schedule",
        choiceLabel: `Schedule on "${orc.instanceID}"`,
        id: orc.id,
        description: `Run this operation on ${orc.instanceID}`,
        onSelect() {
          setSelectedID(orc.id);
        },
        onClick() {
          execute({
            delegationTarget: orc.instanceID,
            requestDelegation: true,
          });
        },
      });
    }
  }

  const defaultID =
    options.find((option) => option.default)?.id || options[0]?.id || "execute";
  let [selectedID, setSelectedID] = fos.useBrowserStorage(
    persistUnderKey,
    defaultID
  );
  const selectedOption = options.find((option) => option.id === selectedID);

  useEffect(() => {
    if (options.length === 1) {
      setSelectedID(options[0].id);
    }
  }, [options]);

  const handleSubmit = useCallback(() => {
    const selectedOption = options.find((option) => option.id === selectedID);
    if (selectedOption) {
      selectedOption.onClick();
    }
  }, [options, selectedID]);

  if (selectedOption) selectedOption.selected = true;
  const showWarning =
    executionOptions.orchestratorRegistrationEnabled &&
    !hasAvailableOrchestators;
  const warningMessage =
    "There are no available orchestrators to schedule this operation. Please contact your administrator to add an orchestrator.";

  return {
    showWarning,
    warningTitle: "No available orchestrators",
    warningMessage,
    options,
    hasOptions: options.length > 0,
    isLoading: execDetails.isLoading,
    handleSubmit,
  };
};

export const useOperatorPrompt = () => {
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
    async (options = null) => {
      const resolved =
        cachedResolvedInput || (await operator.resolveInput(ctx));
      const { invalid } = await validate(ctx, resolved);
      if (invalid) {
        return;
      }
      executor.execute(promptingOperator.params, options);
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

  const submitOptions = useOperatorPromptSubmitOptions(
    operator.uri,
    execDetails,
    execute
  );

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
};

const operatorIOState = atom({
  key: "operatorIOState",
  default: { visible: false },
});

export const operatorPaletteOpened = selector({
  key: "operatorPaletteOpened",
  get: ({ get }) => {
    return (
      get(showOperatorPromptSelector) ||
      get(operatorBrowserVisibleState) ||
      get(operatorIOState).visible
    );
  },
});

export function useShowOperatorIO() {
  const [state, setState] = useRecoilState(operatorIOState);
  return {
    ...state,
    showButtons: state.hideButtons !== true && state.isInput,
    type: state.isInput ? "input" : "output",
    show: ({
      schema,
      isOutput,
      isInput,
      data,
      hideButtons,
      validationErrors,
    }) => {
      setState({
        validationErrors,
        hideButtons,
        isInput,
        isOutput,
        schema,
        data,
        visible: true,
      });
    },
    hide: () => {
      setState({ visible: false });
    },
  };
}

export function filterChoicesByQuery(query, all) {
  const sanitizedQuery = query.trim();
  if (sanitizedQuery.length === 0) return all;
  return all.filter(({ label = "", value = "", description = "" }) => {
    value = value || "";
    description = description || "";
    label = label || "";
    return (
      label.toLowerCase().includes(sanitizedQuery.toLowerCase()) ||
      value.toLowerCase().includes(sanitizedQuery.toLowerCase()) ||
      description.toLowerCase().includes(sanitizedQuery.toLowerCase())
    );
  });
}

export const availableOperatorsRefreshCount = atom({
  key: "availableOperatorsRefreshCount",
  default: 0,
});

export const operatorsInitializedAtom = atom({
  key: "operatorsInitializedAtom",
  default: false,
});

export const availableOperators = selector({
  key: "availableOperators",
  get: ({ get }) => {
    get(availableOperatorsRefreshCount); // triggers force refresh manually
    return listLocalAndRemoteOperators().allOperators.map((operator) => {
      return {
        label: operator.label,
        name: operator.name,
        value: operator.uri,
        description: operator.config.description,
        unlisted: operator.unlisted,
        canExecute: operator.config.canExecute,
        pluginName: operator.pluginName,
        _builtIn: operator._builtIn,
        icon: operator.config.icon,
        darkIcon: operator.config.darkIcon,
        lightIcon: operator.config.lightIcon,
      };
    });
  },
});

export const operatorBrowserVisibleState = atom({
  key: "operatorBrowserVisibleState",
  default: false,
});
export const operatorBrowserQueryState = atom({
  key: "operatorBrowserQueryState",
  default: "",
});

function sortResults(results, recentlyUsedOperators) {
  const recentlyUsedOperatorsCount = recentlyUsedOperators.length;
  return results
    .map((result) => {
      let score = (result.description || result.label).charCodeAt(0);
      if (recentlyUsedOperators.includes(result.value)) {
        const recentIdx = recentlyUsedOperators.indexOf(result.value);
        score = (recentlyUsedOperatorsCount - recentIdx) * -1;
      }
      if (result.canExecute === false) {
        score += results.length;
      }
      return {
        ...result,
        score,
      };
    })
    .sort((a, b) => {
      if (a.score < b.score) {
        return -1;
      }
      if (a.score > b.score) {
        return 1;
      }
      return 0;
    });
}

export const operatorBrowserChoices = selector({
  key: "operatorBrowserChoices",
  get: ({ get }) => {
    const allChoices = get(availableOperators);
    const query = get(operatorBrowserQueryState);
    let results = [...allChoices];
    results = results.filter(({ unlisted }) => !unlisted);
    if (query && query.length > 0) {
      results = filterChoicesByQuery(query, results);
    }
    return sortResults(results, get(recentlyUsedOperatorsState));
  },
});
export const operatorDefaultChoice = selector({
  key: "operatorDefaultChoice",
  get: ({ get }) => {
    const choices = get(operatorBrowserChoices);
    const firstOperatorName = choices?.[0]?.value;
    return firstOperatorName || null;
  },
});
export const operatorChoiceState = atom({
  key: "operatorChoiceState",
  default: null,
});

export const recentlyUsedOperatorsState = atom({
  key: "recentlyUsedOperators",
  default: [],
  effects: [
    fos.getBrowserStorageEffectForKey("recently-used-operators", {
      useJsonSerialization: true,
    }),
  ],
});

export function useOperatorBrowser() {
  const [isVisible, setIsVisible] = useRecoilState(operatorBrowserVisibleState);
  const [query, setQuery] = useRecoilState(operatorBrowserQueryState);
  const [selected, setSelected] = useRecoilState(operatorChoiceState);
  const defaultSelected = useRecoilValue(operatorDefaultChoice);
  const choices = useRecoilValue(operatorBrowserChoices);
  const promptForInput = usePromptOperatorInput();
  const isOperatorPaletteOpened = useRecoilValue(operatorPaletteOpened);

  const selectedValue = useMemo(() => {
    return selected ?? defaultSelected;
  }, [selected, defaultSelected]);

  const onChangeQuery = (query) => {
    setQuery(query);
  };

  const close = useCallback(() => {
    setIsVisible(false);
    // reset necessary state
    setQuery("");
    setSelected(null);
  }, [setIsVisible, setQuery, setSelected]);

  const onSubmit = useCallback(() => {
    const firstChoice = choices[0];
    const selectedOperator = selectedValue
      ? choices.find(({ value }) => value === selectedValue)
      : firstChoice;
    if (selectedOperator && selectedOperator.canExecute) {
      close();
      promptForInput(selectedOperator.value);
    } else if (!selectedOperator) {
      close();
    }
  }, [choices, selectedValue, close, promptForInput]);

  const getSelectedPrevAndNext = useCallback(() => {
    const selectedIndex = choices.findIndex(
      ({ value }) => value === selectedValue
    );
    const selected = choices[selectedIndex];
    const lastChoice = choices[choices.length - 1];
    const firstChoice = choices[0];
    if (selectedIndex === -1)
      return {
        selected: null,
        selectedPrev: lastChoice?.value || null,
        selectedNext: firstChoice?.value || null,
      };

    const selectedPrev = (
      choices[selectedIndex - 1] || choices[choices.length - 1]
    ).value;
    const selectedNext = (choices[selectedIndex + 1] || choices[0]).value;
    return { selected, selectedPrev, selectedNext };
  }, [choices, selectedValue]);

  const selectNext = useCallback(() => {
    setSelected(getSelectedPrevAndNext().selectedNext);
  }, [setSelected, getSelectedPrevAndNext]);

  const selectPrevious = useCallback(() => {
    setSelected(getSelectedPrevAndNext().selectedPrev);
  }, [setSelected, getSelectedPrevAndNext]);

  const onKeyDown = useCallback(
    (e) => {
      if (e.key !== "`" && !isVisible) return;
      if (e.key === "`" && isOperatorPaletteOpened) return;
      if (BROWSER_CONTROL_KEYS.includes(e.key)) e.preventDefault();
      switch (e.key) {
        case "ArrowDown":
          selectNext();
          break;
        case "ArrowUp":
          selectPrevious();
          break;
        case "`":
          if (isOperatorPaletteOpened) break;
          if (isVisible) {
            close();
          } else {
            setIsVisible(true);
          }
          break;
        case "Enter":
          onSubmit();
          break;
        case "Escape":
          close();
          break;
      }
    },
    [
      selectNext,
      selectPrevious,
      isVisible,
      onSubmit,
      close,
      setIsVisible,
      isOperatorPaletteOpened,
    ]
  );

  const toggle = useCallback(() => {
    setIsVisible((isVisible) => !isVisible);
  }, [setIsVisible]);

  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onKeyDown]);

  const setSelectedAndSubmit = useCallback(
    (choice) => {
      if (choice.canExecute) {
        close();
        promptForInput(choice.value);
      }
    },
    [close, promptForInput]
  );

  const clear = () => {
    setQuery("");
    setSelected(null);
  };

  return {
    selectedValue,
    isVisible,
    choices,
    onChangeQuery,
    onSubmit,
    selectNext,
    selectPrevious,
    setSelectedAndSubmit,
    close,
    clear,
    toggle,
    hasQuery: typeof query === "string" && query.length > 0,
    query,
  };
}

type OperatorExecutorOptions = {
  delegationTarget?: string;
  requestDelegation?: boolean;
  skipOutput?: boolean;
};

export function useOperatorExecutor(uri, handlers: any = {}) {
  if (!uri.includes("/")) {
    uri = `@voxel51/operators/${uri}`;
  }

  const { operator } = getLocalOrRemoteOperator(uri);
  const [isExecuting, setIsExecuting] = useState(false);

  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [hasExecuted, setHasExecuted] = useState(false);
  const [isDelegated, setIsDelegated] = useState(false);

  const [needsOutput, setNeedsOutput] = useState(false);
  const ctx = useExecutionContext(uri);
  const hooks = operator.useHooks(ctx);
  const notify = fos.useNotification();

  const clear = useCallback(() => {
    setIsExecuting(false);
    setError(null);
    setResult(null);
    setHasExecuted(false);
    setNeedsOutput(false);
  }, [setIsExecuting, setError, setResult, setHasExecuted, setNeedsOutput]);

  const execute = useRecoilCallback(
    (state) => async (paramOverrides, options?: OperatorExecutorOptions) => {
      const { delegationTarget, requestDelegation, skipOutput } = options || {};
      setIsExecuting(true);
      const { params, ...currentContext } = await state.snapshot.getPromise(
        currentContextSelector(uri)
      );

      const ctx = new ExecutionContext(
        paramOverrides || params,
        currentContext,
        hooks
      );
      ctx.state = state;
      ctx.delegationTarget = delegationTarget;
      ctx.requestDelegation = requestDelegation;
      try {
        ctx.hooks = hooks;
        ctx.state = state;
        const result = await executeOperatorWithContext(uri, ctx);
        setNeedsOutput(
          skipOutput ? false : await operator.needsOutput(ctx, result)
        );
        setResult(result.result);
        setError(result.error);
        setIsDelegated(result.delegated);
        handlers.onSuccess?.(result);
      } catch (e) {
        const isAbortError =
          e.name === "AbortError" || e instanceof DOMException;
        if (!isAbortError) {
          setError(e);
          setResult(null);
          handlers.onError?.(e);
          console.error("Error executing operator", operator, ctx);
          console.error(e);
          notify({ msg: e.message, variant: "error" });
        }
      }
      setHasExecuted(true);
      setIsExecuting(false);
    },
    [ctx]
  );
  return {
    isExecuting,
    hasExecuted,
    execute,
    needsOutput,
    error,
    result,
    clear,
    hasResultOrError: result || error,
    isDelegated,
  };
}

export function useExecutorQueue() {}

export function useInvocationRequestQueue() {
  const ref = useRef<InvocationRequestQueue>();
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    const queue = (ref.current = getInvocationRequestQueue());
    const subscriber = (updatedQueue) => {
      setRequests(updatedQueue.toJSON());
    };
    queue.subscribe(subscriber);
    return () => {
      queue.unsubscribe(subscriber);
    };
  }, []);

  const onSuccess = useCallback((id) => {
    const queue = ref.current;
    if (queue) {
      queue.markAsCompleted(id);
    }
  }, []);

  const onError = useCallback((id) => {
    const queue = ref.current;
    if (queue) {
      queue.markAsFailed(id);
    }
  }, []);

  return {
    requests,
    onSuccess,
    onError,
  };
}

export function useInvocationRequestExecutor({
  queueItem,
  onSuccess,
  onError,
}) {
  const executor = useOperatorExecutor(queueItem.request.operatorURI, {
    onSuccess: () => {
      onSuccess(queueItem.id);
    },
    onError: () => {
      onError(queueItem.id);
    },
  });

  return executor;
}

export const operatorThrottledContext = atom({
  key: "operatorThrottledContext",
  default: {},
});

export const operatorPlacementsAtom = atom({
  key: "operatorPlacementsAtom",
  default: [],
});

export const placementsForPlaceSelector = selectorFamily({
  key: "operatorsForPlaceSelector",
  get:
    (place: Places) =>
    ({ get }) => {
      const placements = get(operatorPlacementsAtom);
      return placements
        .filter(
          (p) => p.placement.place === place && p.operator?.config?.canExecute
        )
        .map(({ placement, operator }) => ({ placement, operator }));
    },
});

export function useOperatorPlacements(place: Places) {
  const placements = useRecoilValue(placementsForPlaceSelector(place));

  return { placements };
}
