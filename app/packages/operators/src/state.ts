import {
  atom,
  selector,
  useRecoilValue,
  useRecoilState,
  useRecoilTransaction_UNSTABLE,
} from "recoil";
import { useState, useEffect, useCallback } from "react";
import { getLocalOrRemoteOperator, useOperatorExecutor } from "./operators";

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
    if (!operator.needsUserInput()) {
      return {};
    }
    const fields = operator.definition.inputs.map((input) => {
      return {
        name: input.name,
        label: input.label || input.name,
        type: input.type,
        default: input.default,
      };
    });
    return { fields, operator };
  },
});

export const usePromptOperatorInput = () => {
  const [promptingOperator, setPromptingOperator] = useRecoilState(
    promptingOperatorState
  );

  const prompt = (operatorName) => {
    const { operator, isRemote } = getLocalOrRemoteOperator(operatorName);
    setPromptingOperator({ operatorName, params: {} });
  };

  return prompt;
};

export const useOperatorPrompt = () => {
  const [promptingOperator, setPromptingOperator] = useRecoilState(
    promptingOperatorState
  );
  const { fields, operator } = useRecoilValue(operatorPromptState);
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

  const executor = useOperatorExecutor(promptingOperator?.operatorName);
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
          execute();
          break;
        case "Escape":
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

  if (!promptingOperator) return null;

  const isExecuting = operator && operator.isExecuting;
  const hasResultOrError = operator && (operator.result || operator.error);
  const showPrompt = fields && !isExecuting && !hasResultOrError;

  return {
    fields,
    setFieldValue,
    operator,
    execute,
    showPrompt: showPrompt,
    isExecuting,
    hasResultOrError,
    close,
    cancel: close,
  };
};

export function filterChoicesByQuery(query, all) {
  return all.filter(({ label, value, description }) => {
    return (
      label.toLowerCase().includes(query.toLowerCase()) ||
      value.toLowerCase().includes(query.toLowerCase()) ||
      description.toLowerCase().includes(query.toLowerCase())
    );
  });
}

export function useOperatorBrowser() {
  const [isVisible, setIsVisible] = useState(false);
  const [query, setQuery] = useState(null);
  const [choices, setChoices] = useState([]);
  const promptForInput = usePromptOperatorInput();

  const allChoices = [
    {
      label: "Hello World",
      value: "hello-world",
      description: "A simple operator that says hello",
    },
    {
      label: "Compute Similarity",
      value: "compute-sim",
      description: "Compute similarity!",
    },
  ];

  useEffect(() => {
    if (query && query.length > 0) {
      setChoices(filterChoicesByQuery(query, allChoices));
    } else {
      setChoices(allChoices);
    }
  }, [query]);

  const onChangeQuery = (query) => {
    console.log("query", query);
    setQuery(query);
  };

  const onSubmit = () => {
    const selected = choices.find((choice) => choice.selected) || choices[0];
    console.log("onSubmit", selected);
    if (selected) {
      promptForInput(selected.value);
    }
  };

  const selectNext = useCallback(() => {
    console.log("select next");
    for (let i = 0; i < choices.length; i++) {
      if (choices[i].selected) {
        choices[i].selected = false;
        if (choices[i + 1]) {
          choices[i + 1].selected = true;
        } else {
          choices[0].selected = true;
        }
        setChoices([...choices]);
        return;
      }
      choices[0].selected = true;
      setChoices([...choices]);
    }
  }, [choices]);

  const selectPrevious = useCallback(() => {
    console.log("select prev");
    for (let i = 0; i < choices.length; i++) {
      if (choices[i].selected) {
        choices[i].selected = false;
        if (choices[i - 1]) {
          choices[i - 1].selected = true;
        } else {
          choices[choices.length - 1].selected = true;
        }
        setChoices([...choices]);
        return;
      }
    }
    choices[choices.length - 1].selected = true;
    setChoices([...choices]);
  }, [choices]);

  const onKeyDown = useCallback(
    (e) => {
      if (e.key !== "`" && !isVisible) return;
      e.preventDefault();
      switch (e.key) {
        case "ArrowDown":
          selectNext();
          break;
        case "ArrowUp":
          selectPrevious();
          break;
        case "`":
          setIsVisible(!isVisible);
          break;
        case "Enter":
          setIsVisible(false);
          onSubmit();
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

  return {
    isVisible,
    choices,
    onChangeQuery,
    onSubmit,
    selectNext,
    selectPrevious,
  };
}
