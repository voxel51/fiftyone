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
} from "./operators";
import * as fos from "@fiftyone/state";
import { BROWSER_CONTROL_KEYS } from "./constants";

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

    const inputFields = operator.definition.inputs.toProps();
    const outputFields = operator.definition.outputs.toProps();
    return { outputFields, operatorName };
  },
});

export const currentOperatorParamsSelector = selectorFamily({
  key: "currentOperatorParamsSelector",
  get:
    (operatorName) =>
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
  const [promptingOperator, setPromptingOperator] = useRecoilState(
    promptingOperatorState
  );

  const prompt = (operatorName) => {
    setPromptingOperator({ operatorName, params: {} });
  };

  return prompt;
};

const currentContextSelector = selectorFamily({
  key: "currentContextSelector",
  get:
    (operatorName) =>
    ({ get }) => {
      const datasetName = get(fos.datasetName);
      const view = get(fos.view);
      const extended = get(fos.extendedStages);
      const filters = get(fos.filters);
      const selectedSamples = get(fos.selectedSamples);
      const params = get(currentOperatorParamsSelector(operatorName));
      return {
        datasetName,
        view,
        extended,
        filters,
        selectedSamples,
        params,
      };
    },
});

const useExecutionContext = (operatorName, hooks = {}) => {
  const curCtx = useRecoilValue(currentContextSelector(operatorName));
  const { datasetName, view, extended, filters, selectedSamples, params } =
    curCtx;
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
  console.log("useOperatorPrompt");
  const [promptingOperator, setPromptingOperator] = useRecoilState(
    promptingOperatorState
  );
  const { outputFields } = useRecoilValue(operatorPromptState);

  const { operatorName } = promptingOperator;
  const ctx = useExecutionContext(operatorName);
  const operator = getLocalOrRemoteOperator(operatorName).operator;
  const hooks = operator.useHooks(ctx);
  console.log("hooks", hooks);
  const [inputFields, setInputFields] = useState([]);
  const resolveInputFields = useCallback(async () => {
    console.log("resolveInputFields");
    ctx.hooks = hooks;
    const resolved = await operator.resolveInput(ctx);
    console.log("resolved", resolved.toProps());
    setInputFields(resolved.toProps());
  }, [ctx, operatorName, hooks, JSON.stringify(ctx.params)]);

  useEffect(() => {
    console.log("useEffect resolveInputFields");
    resolveInputFields();
  }, [ctx.params]);

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

  const executor = useOperatorExecutor(promptingOperator.operatorName);
  const execute = useCallback(() => {
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
      debugger;
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
    setFieldValue,
    operator,
    execute,
    executor,
    showPrompt,
    isExecuting,
    hasResultOrError,
    close,
    cancel: close,
  };
};

export function filterChoicesByQuery(query, all) {
  const sanitizedQuery = query.trim();
  if (sanitizedQuery.length === 0) return all;
  return all.filter(({ label = "", value = "", description = "" }) => {
    return (
      label.toLowerCase().includes(sanitizedQuery.toLowerCase()) ||
      value.toLowerCase().includes(sanitizedQuery.toLowerCase()) ||
      description.toLowerCase().includes(sanitizedQuery.toLowerCase())
    );
  });
}

export const availableOperators = selector({
  key: "availableOperators",
  get: ({ get }) => {
    return listLocalAndRemoteOperators().allOperators.map((operator) => {
      return {
        label: operator.name,
        value: operator.name,
        description: operator.definition.description,
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
export const operatorBrowserChoices = selector({
  key: "operatorBrowserChoices",
  get: ({ get }) => {
    const allChoices = get(availableOperators);
    const query = get(operatorBrowserQueryState);
    if (query && query.length > 0) {
      return filterChoicesByQuery(query, allChoices);
    } else {
      return allChoices;
    }
  },
});
export const operatorChoiceState = atom({
  key: "operatorChoiceState",
  default: null,
});

export function useOperatorBrowser() {
  const [isVisible, setIsVisible] = useRecoilState(operatorBrowserVisibleState);
  const setQuery = useSetRecoilState(operatorBrowserQueryState);
  const [selectedValue, setSelected] = useRecoilState(operatorChoiceState);
  const choices = useRecoilValue(operatorBrowserChoices);
  const promptForInput = usePromptOperatorInput();

  const onChangeQuery = (query) => {
    console.log("query", query);
    setQuery(query);
  };

  const close = () => {
    setIsVisible(false);
    // reset necessary state
    setQuery("");
    setSelected(null);
  };

  const onSubmit = () => {
    console.log("onSubmit", selectedValue);
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
    console.log("select next");
    setSelected(getSelectedPrevAndNext().selectedNext);
  }, [choices, selectedValue]);

  const selectPrevious = useCallback(() => {
    console.log("select prev");
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

export function useOperatorExecutor(name) {
  const { operator } = getLocalOrRemoteOperator(name);
  const [isExecuting, setIsExecuting] = useRecoilState(
    operatorIsExecutingState
  );
  const [error, setError] = useRecoilState(operatorExecutionErrorState);
  const [result, setResult] = useRecoilState(operatorExecutionResultState);

  const [needsOutput, setNeedsOutput] = useRecoilState(
    operatorExecutionNeedsOutputState
  );
  const selectedSamples = useRecoilValue(fos.selectedSamples);
  const ctx = useExecutionContext(name);
  const hooks = operator.useHooks(ctx);
  console.log({ ctx });

  const clear = () => {
    setError(null);
    setResult(null);
    setIsExecuting(false);
  };

  const execute = useRecoilCallback(
    (state) => async (paramOverrides) => {
      setIsExecuting(true);
      const { params, ...currentContext } = await state.snapshot.getPromise(
        currentContextSelector(name)
      );
      const ctx = new ExecutionContext(
        paramOverrides || params,
        currentContext,
        hooks
      );
      ctx.state = state;
      console.log("execute", { ctx });
      try {
        ctx.hooks = hooks;
        ctx.state = state;
        const result = await executeOperator(name, ctx);
        setResult(result.result);
        setError(result.error);
        setNeedsOutput(result.hasOutputContent());
      } catch (e) {
        console.error("Error executing operator");
        console.error(e);
        setError(e);
        setResult(null);
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
