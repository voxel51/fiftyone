import { useAnalyticsInfo } from "@fiftyone/analytics";
import * as fos from "@fiftyone/state";
import { debounce } from "lodash";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  atom,
  selector,
  selectorFamily,
  useRecoilCallback,
  useRecoilState,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
  useRecoilValueLoadable,
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
  resolveOperatorURI,
} from "./operators";
import { OperatorPromptType, Places } from "./types";
import { OperatorExecutorOptions } from "./types-internal";
import { ValidationContext } from "./validation";
import { Markdown } from "@fiftyone/components";

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

  const prompt = (operatorName, params = {}, options = {}) => {
    setRecentlyUsedOperators((recentlyUsedOperators) => {
      const update = new Set([operatorName, ...recentlyUsedOperators]);
      return Array.from(update).slice(0, 5);
    });

    setPromptingOperator({
      operatorName,
      params,
      options,
      initialParams: params,
    });
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
    const viewName = get(fos.viewName);
    const extendedSelection = get(fos.extendedSelection);
    const groupSlice = get(fos.groupSlice);
    const queryPerformance = get(fos.queryPerformance);
    const spaces = get(fos.sessionSpaces);
    const workspaceName = spaces?._name;

    return {
      datasetName,
      view,
      extended,
      filters,
      selectedSamples,
      selectedLabels,
      viewName,
      extendedSelection,
      groupSlice,
      queryPerformance,
      spaces,
      workspaceName,
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

export function useGlobalExecutionContext(): ExecutionContext {
  const globalCtx = useRecoilValue(globalContextSelector);
  const ctx = useMemo(() => {
    return new ExecutionContext({}, globalCtx);
  }, [globalCtx]);
  return ctx;
}

const useExecutionContext = (operatorName, hooks = {}) => {
  const curCtx = useRecoilValue(currentContextSelector(operatorName));
  const currentSample = useCurrentSample();
  const {
    datasetName,
    view,
    extended,
    filters,
    selectedSamples,
    params,
    selectedLabels,
    viewName,
    extendedSelection,
    groupSlice,
    queryPerformance,
    spaces,
    workspaceName,
  } = curCtx;
  const [analyticsInfo] = useAnalyticsInfo();
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
        extendedSelection,
        analyticsInfo,
        groupSlice,
        queryPerformance,
        spaces,
        workspaceName,
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
    groupSlice,
    queryPerformance,
    spaces,
    workspaceName,
  ]);

  return ctx;
};

function useExecutionOptions(operatorURI, ctx, isRemote) {
  const [isLoading, setIsLoading] = useState(true);
  const [executionOptions, setExecutionOptions] = useState(null);

  const fetch = useCallback(
    debounce(async (ctxOverride = null) => {
      if (!isRemote) {
        setExecutionOptions({ allowImmediateExecution: true });
        return;
      }
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

/**
 * Type representing an operator execution target.
 */
export type OperatorExecutionOption = {
  label: string;
  id: string;
  description: string | React.ReactNode;
  onClick?: () => void;
  isDelegated: boolean;
  choiceLabel?: string;
  tag?: string;
  default?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  isDisabledSchedule?: boolean;
};

const useOperatorPromptSubmitOptions = (
  operatorURI,
  execDetails,
  execute: (options?: OperatorExecutorOptions) => void,
  promptView?: OperatorPromptType["promptView"]
) => {
  const options: OperatorExecutionOption[] = [];
  const persistUnderKey = `operator-prompt-${operatorURI}`;
  const availableOrchestrators =
    execDetails.executionOptions?.availableOrchestrators || [];
  const hasAvailableOrchestrators = availableOrchestrators.length > 0;
  const executionOptions = execDetails.executionOptions || {};
  const defaultToExecute = executionOptions.allowDelegatedExecution
    ? !executionOptions.defaultChoiceToDelegated
    : true;
  const defaultToSchedule = executionOptions.allowDelegatedExecution
    ? executionOptions.defaultChoiceToDelegated
    : false;
  if (executionOptions.allowImmediateExecution) {
    options.push({
      label:
        promptView?.submitButtonLabel ||
        promptView?.submit_button_label ||
        "Execute",
      id: "execute",
      tag: "FOR TESTING",
      default: defaultToExecute,
      description:
        "Run this operation synchronously. Only suitable for small datasets",
      onSelect() {
        setSelectedID("execute");
      },
      onClick() {
        execute();
      },
      isDelegated: false,
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
      description: "Run this operation in the background",
      onSelect() {
        setSelectedID("schedule");
      },
      onClick() {
        execute({ requestDelegation: true });
      },
      isDelegated: true,
    });
  }

  if (
    executionOptions.allowDelegatedExecution &&
    hasAvailableOrchestrators &&
    executionOptions.orchestratorRegistrationEnabled
  ) {
    for (let orc of execDetails.executionOptions.availableOrchestrators) {
      options.push({
        label: "Schedule",
        choiceLabel: `Schedule on ${orc.instanceID}`,
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
        isDelegated: true,
      });
    }
  } else if (
    executionOptions.allowDelegatedExecution &&
    executionOptions.allowImmediateExecution &&
    executionOptions.orchestratorRegistrationEnabled &&
    !hasAvailableOrchestrators
  ) {
    const markdownDesc = React.createElement(
      Markdown,
      null,
      "[Learn how](https://docs.voxel51.com/plugins/using_plugins.html#delegated-operations) to run this operation in the background"
    );
    options.push({
      label: "Schedule",
      choiceLabel: `Schedule`,
      tag: "NOT AVAILABLE",
      id: "disabled-schedule",
      description: markdownDesc,
      isDelegated: true,
      isDisabledSchedule: true,
    });
  }

  // sort options so that the default is always the first in the list
  options.sort((a, b) => {
    if (a.default) return -1;
    if (b.default) return 1;
    return 0;
  });

  const fallbackId = executionOptions.allowImmediateExecution
    ? "execute"
    : "schedule";

  const defaultID =
    options.find((option) => option.default)?.id ||
    options[0]?.id ||
    fallbackId;

  let [selectedID, setSelectedID] = fos.useBrowserStorage(
    persistUnderKey,
    defaultID
  );
  const selectedOption = options.find((option) => option.id === selectedID);

  useEffect(() => {
    const selectedOptionExists = !!options.find((o) => o.id === selectedID);
    if (options.length === 1) {
      setSelectedID(options[0].id);
    } else if (!selectedOptionExists) {
      const nextSelectedID =
        options.find((option) => option.default)?.id || options[0]?.id;
      setSelectedID(nextSelectedID);
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
    !hasAvailableOrchestrators &&
    !executionOptions.allowImmediateExecution;
  const warningStr =
    "This operation requires [delegated execution](https://docs.voxel51.com/plugins/using_plugins.html#delegated-operations)";
  const warningMessage = React.createElement(Markdown, null, warningStr);

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

/**
 * Hook which provides state management for operator option enumeration.
 */
export const useOperatorExecutionOptions = ({
  operatorUri,
  onExecute,
}: {
  operatorUri: string;
  onExecute: (opts: OperatorExecutorOptions) => void;
}): {
  executionOptions: OperatorExecutionOption[];
  hasOptions: boolean;
  warningMessage: React.ReactNode;
  showWarning: boolean;
  isLoading: boolean;
} => {
  const ctx = useExecutionContext(operatorUri);
  const { isRemote } = getLocalOrRemoteOperator(operatorUri);
  const execDetails = useExecutionOptions(operatorUri, ctx, isRemote);
  const submitOptions = useOperatorPromptSubmitOptions(
    operatorUri,
    execDetails,
    onExecute
  );

  return {
    executionOptions: submitOptions.options,
    hasOptions: submitOptions.hasOptions,
    warningMessage: submitOptions.warningMessage,
    showWarning: submitOptions.showWarning,
    isLoading: execDetails.isLoading,
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
        if (state) {
          set(promptingOperatorState, {
            ...state,
            params: {
              ...state?.params,
              [fieldName]: value,
            },
          });
        }
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
        ...options,
        ...promptingOperator.options,
      });
    },
    [operator, promptingOperator, cachedResolvedInput]
  );
  const onCancel = promptingOperator.options?.onCancel;
  const cancel = () => {
    if (onCancel) onCancel();
    close();
  };
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
    execute,
    promptView
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
    cancel,
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

export function useCurrentSample() {
  // 'currentSampleId' may suspend for group datasets, so we use a loadable
  const currentSample = useRecoilValueLoadable(fos.currentSampleId);
  return currentSample.state === "hasValue" ? currentSample.contents : null;
}

export function useOperatorBrowser() {
  const [isVisible, setIsVisible] = useRecoilState(operatorBrowserVisibleState);
  const [query, setQuery] = useRecoilState(operatorBrowserQueryState);
  const [selected, setSelected] = useRecoilState(operatorChoiceState);
  const defaultSelected = useRecoilValue(operatorDefaultChoice);
  const choices = useRecoilValue(operatorBrowserChoices);
  const promptForInput = usePromptOperatorInput();
  const isOperatorPaletteOpened = useRecoilValue(operatorPaletteOpened);
  const editingField = useRecoilValue(fos.editingFieldAtom);

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
      if (BROWSER_CONTROL_KEYS.includes(e.key) && !editingField)
        e.preventDefault();
      switch (e.key) {
        case "ArrowDown":
          selectNext();
          break;
        case "ArrowUp":
          selectPrevious();
          break;
        case "`":
          if (isOperatorPaletteOpened || editingField) break;
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

export function useOperatorExecutor(uri, handlers: any = {}) {
  uri = resolveOperatorURI(uri, { keepMethod: true });

  const { operator } = getLocalOrRemoteOperator(uri);
  const [isExecuting, setIsExecuting] = useState(false);

  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [hasExecuted, setHasExecuted] = useState(false);
  const [isDelegated, setIsDelegated] = useState(false);

  const [needsOutput, setNeedsOutput] = useState(false);
  const context = useExecutionContext(uri);
  const currentSample = useCurrentSample();
  const hooks = operator.useHooks(context);
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
      const { delegationTarget, requestDelegation, skipOutput, callback } =
        options || {};
      setIsExecuting(true);
      const { params, ...currentContext } = await state.snapshot.getPromise(
        currentContextSelector(uri)
      );

      const ctx = new ExecutionContext(
        paramOverrides || params,
        { ...currentContext, currentSample },
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
        if (result.error) {
          handlers.onError?.(result, { ctx });
          notify({
            msg: result.errorMessage || `Operation failed: ${uri}`,
            variant: "error",
          });
          console.error("Error executing operator", uri, result.errorMessage);
          console.error(result.error);
        } else {
          handlers.onSuccess?.(result, { ctx });
        }
        callback?.(result, { ctx });
      } catch (e) {
        callback?.(new OperatorResult(operator, null, ctx.executor, e, false), {
          ctx,
        });
        const isAbortError =
          e.name === "AbortError" || e instanceof DOMException;
        const msg = e.message || "Failed to execute an operation";
        if (!isAbortError) {
          setError(e);
          setResult(null);
          handlers.onError?.(e);
          console.error("Error executing operator", operator, ctx);
          console.error(e);
          notify({ msg, variant: "error" });
        }
      }
      setHasExecuted(true);
      setIsExecuting(false);
    },
    [currentSample, context]
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

export const activePanelsEventCountAtom = atom({
  key: "activePanelsEventCountAtom",
  default: new Map<string, number>(),
});
