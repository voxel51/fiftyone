import {
  atom,
  selector,
  selectorFamily,
  useRecoilValue,
  useRecoilState,
  useRecoilCallback,
  useSetRecoilState,
  useRecoilTransaction_UNSTABLE,
} from "recoil";
import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import {
  getLocalOrRemoteOperator,
  listLocalAndRemoteOperators,
  executeOperator,
  ExecutionContext,
  getInvocationRequestQueue,
  InvocationRequestQueue,
  OperatorResult,
  fetchRemotePlacements,
} from "./operators";
import * as fos from "@fiftyone/state";
import { BROWSER_CONTROL_KEYS } from "./constants";
import { Places } from "./types";
import { ValidationContext } from "./validation";

export const promptingOperatorState = atom({
  key: "promptingOperator",
  default: null,
});

export const operatorPromptState = selector({
  key: "operatorPromptState",
  get: ({ get }) => {
    const promptingOperator = get(promptingOperatorState);
    if (!promptingOperator) {
      return {};
    }
    const { operatorName, params } = promptingOperator;
    const { operator, isRemote } = getLocalOrRemoteOperator(operatorName);

    const inputFields = operator.inputs.toProps();
    const outputFields = operator.outputs.toProps();
    return { inputFields, outputFields, operatorName };
  },
});

export const currentOperatorParamsSelector = selectorFamily({
  key: "currentOperatorParamsSelector",
  get: (operatorName) => ({ get }) => {
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
  const [recentlyUsedOperators, setRecentlyUsedOperators] = useRecoilState(
    recentlyUsedOperatorsState
  );
  const [promptingOperator, setPromptingOperator] = useRecoilState(
    promptingOperatorState
  );

  const prompt = (operatorName) => {
    setRecentlyUsedOperators((recentlyUsedOperators) => {
      const update = new Set([...recentlyUsedOperators, operatorName]);
      return Array.from(update).slice(-5);
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
    return {
      datasetName,
      view,
      extended,
      filters,
      selectedSamples,
    };
  },
});

const currentContextSelector = selectorFamily({
  key: "currentContextSelector",
  get: (operatorName) => ({ get }) => {
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
      },
      hooks
    );
  }, [params, datasetName, view, extended, filters, selectedSamples, hooks]);

  return ctx;
};

export const useOperatorPrompt = () => {
  const [promptingOperator, setPromptingOperator] = useRecoilState(
    promptingOperatorState
  );

  const { operatorName } = promptingOperator;
  const ctx = useExecutionContext(operatorName);
  const operator = getLocalOrRemoteOperator(operatorName).operator;
  const hooks = operator.useHooks(ctx);
  const executor = useOperatorExecutor(promptingOperator.operatorName);
  const [inputFields, setInputFields] = useState();
  const resolveInputFields = useCallback(async () => {
    ctx.hooks = hooks;
    const resolved = await operator.resolveInput(ctx);
    setInputFields(resolved.toProps());
  }, [ctx, operatorName, hooks, JSON.stringify(ctx.params)]);

  useEffect(() => {
    resolveInputFields();
  }, [ctx.params]);
  const [validationErrors, setValidationErrors] = useState([]);

  const [outputFields, setOutputFields] = useState();
  const resolveOutputFields = useCallback(async () => {
    ctx.hooks = hooks;
    const result = new OperatorResult(operator, executor.result, null, null);
    const resolved = await operator.resolveOutput(ctx, result);
    setOutputFields(resolved.toProps());
  }, [ctx, operatorName, hooks, JSON.stringify(executor.result)]);

  useEffect(() => {
    if (executor.result) {
      resolveOutputFields();
    }
  }, [executor.result]);

  const setFieldValue = useRecoilTransaction_UNSTABLE(
    ({ get, set }) => (fieldName, value) => {
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
  const execute = useCallback(async () => {
    const resolved = await operator.resolveInput(ctx);
    const validationContext = new ValidationContext(ctx, resolved);
    if (validationContext.invalid) {
      setValidationErrors(validationContext.toProps().errors);
      return;
    }
    executor.execute(promptingOperator.params);
  }, [operator, promptingOperator]);
  const close = () => {
    setPromptingOperator(null);
    executor.clear();
  };

  const onKeyDown = useCallback(
    (e) => {
      if (!promptingOperator) return;
      switch (e.key) {
        case "Enter":
          e.preventDefault();
          execute();
          break;
        case "Escape":
          e.preventDefault();
          close();
          break;
      }
    },
    [execute, close, promptingOperator]
  );

  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onKeyDown]);

  useEffect(() => {
    if (operator && !operator.needsUserInput() && !operator.needsResolution()) {
      execute();
    }
  }, [operator]);

  const isExecuting = executor && executor.isExecuting;
  const hasResultOrError = executor && (executor.result || executor.error);
  const showPrompt = inputFields && !isExecuting && !hasResultOrError;

  useEffect(() => {
    if (hasResultOrError && !executor.needsOutput) {
      close();
    }
  }, [executor.result, executor.error, executor.needsOutput]);

  if (!promptingOperator) return null;

  return {
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
  };
};

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

export const availableOperators = selector({
  key: "availableOperators",
  get: () => {
    return listLocalAndRemoteOperators().allOperators.map((operator) => {
      return {
        label: operator.label,
        name: operator.name,
        value: operator.uri,
        description: operator.description,
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
  return results
    .map((result) => {
      let score = (result.description || result.label).charCodeAt(0);
      if (recentlyUsedOperators.includes(result.label)) {
        const recentIdx = recentlyUsedOperators.indexOf(result.label);
        const recentScore = recentlyUsedOperators.length - recentIdx;
        score = recentScore;
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
      if (a.scrote > b.scrote) {
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
    if (query && query.length > 0) {
      results = filterChoicesByQuery(query, allChoices);
    }
    return sortResults(results, get(recentlyUsedOperatorsState));
  },
});
export const operatorChoiceState = atom({
  key: "operatorChoiceState",
  default: null,
});

export const recentlyUsedOperatorsState = atom({
  key: "recentlyUsedOperators",
  default: [],
});

export function useOperatorBrowser() {
  const [isVisible, setIsVisible] = useRecoilState(operatorBrowserVisibleState);
  const [query, setQuery] = useRecoilState(operatorBrowserQueryState);
  const [selectedValue, setSelected] = useRecoilState(operatorChoiceState);
  const choices = useRecoilValue(operatorBrowserChoices);
  const promptForInput = usePromptOperatorInput();

  const onChangeQuery = (query) => {
    setQuery(query);
  };

  const close = () => {
    setIsVisible(false);
    // reset necessary state
    setQuery("");
    setSelected(null);
  };

  const onSubmit = () => {
    close();
    const acceptedValue = selectedValue || choices[0]?.value;
    if (acceptedValue) {
      promptForInput(acceptedValue);
    }
  };

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
  }, [choices, selectedValue]);

  const selectPrevious = useCallback(() => {
    setSelected(getSelectedPrevAndNext().selectedPrev);
  }, [choices, selectedValue]);

  const onKeyDown = useCallback(
    (e) => {
      if (e.key !== "`" && !isVisible) return;
      if (BROWSER_CONTROL_KEYS.includes(e.key)) e.preventDefault();
      switch (e.key) {
        case "ArrowDown":
          selectNext();
          break;
        case "ArrowUp":
          selectPrevious();
          break;
        case "`":
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
    [selectNext, selectPrevious, onSubmit, isVisible]
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
    (value) => {
      close();
      promptForInput(value);
    },
    [setSelected, setIsVisible, onSubmit]
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
  };
}

const operatorIsExecutingState = atom({
  key: "operatorIsExecutingState",
  default: false,
});
const operatorExecutionErrorState = atom({
  key: "operatorExecutionErrorState",
  default: null,
});
const operatorExecutionResultState = atom({
  key: "operatorExecutionResultState",
  default: null,
});
const operatorExecutionNeedsOutputState = atom({
  key: "operatorExecutionNeedsOutputState",
  default: null,
});

export function useOperatorExecutor(uri, handlers: any = {}) {
  if (!uri.includes('/')) {
    uri = `@voxel51/operators/${uri}`;
  }

  const { operator } = getLocalOrRemoteOperator(uri);
  const [isExecuting, setIsExecuting] = useRecoilState(
    operatorIsExecutingState
  );
  ``;
  const [error, setError] = useRecoilState(operatorExecutionErrorState);
  const [result, setResult] = useRecoilState(operatorExecutionResultState);

  const [needsOutput, setNeedsOutput] = useRecoilState(
    operatorExecutionNeedsOutputState
  );
  const selectedSamples = useRecoilValue(fos.selectedSamples);
  const ctx = useExecutionContext(uri);
  const hooks = operator.useHooks(ctx);

  const clear = () => {
    setError(null);
    setResult(null);
    setIsExecuting(false);
  };

  const execute = useRecoilCallback(
    (state) => async (paramOverrides) => {
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
      try {
        ctx.hooks = hooks;
        ctx.state = state;
        const result = await executeOperator(uri, ctx);
        setResult(result.result);
        setError(result.error);
        setNeedsOutput(result.hasOutputContent());
        handlers.onSuccess?.(result);
      } catch (e) {
        console.error("Error executing operator");
        console.error(e);
        setError(e);
        setResult(null);
        handlers.onError?.(e);
      }
      setIsExecuting(false);
    },
    [ctx]
  );
  return {
    isExecuting,
    execute,
    needsOutput,
    error,
    result,
    clear,
  };
}

export function useExecutorQueue() {}

export function useInvocationRequestQueue() {
  const ref = useRef<InvocationRequestQueue>();
  const [requests, setRequests] = useState([]);
  const [itemToExecute, setItemToExecute] = useState(null);

  useEffect(() => {
    const queue = (ref.current = getInvocationRequestQueue());
    const subscriber = (updatedQueue) => {
      const queue = ref.current;
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

export const operatorPlacementsSelector = selector({
  key: "operatorPlacementsSelector",
  get: async ({ get }) => {
    // const globalContext = get(globalContextSelector);

    const datasetName = get(fos.datasetName);
    const view = get(fos.view);
    const extended = get(fos.extendedStages);
    const filters = get(fos.filters);
    // TODO: this should include the actual selected samples
    // using get(fos.selectedSamples) ends up in an infinite loop
    const selectedSamples = new Set(); // get(fos.selectedSamples);
    const _ctx = {
      datasetName,
      view,
      extended,
      filters,
      selectedSamples,
    };
    const ctx = new ExecutionContext({}, _ctx);
    const placements = await fetchRemotePlacements(ctx);
    return placements;
  },
});

export const placementsForPlaceSelector = selectorFamily({
  key: "operatorsForPlaceSelector",
  get: (place: Places) => ({ get }) => {
    const placements = get(operatorPlacementsSelector);
    return placements
      .filter((p) => p.placement.place === place)
      .map((p) => ({
        placement: p.placement,
        operator: p.operator.operator,
      }));
  },
});

export function useOperatorPlacements(place: Place) {
  const placements = useRecoilValue(placementsForPlaceSelector(place));

  return { placements };
}
