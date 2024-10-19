import { useRecoilState, useRecoilValue } from "recoil";
import { useCallback, useEffect, useMemo } from "react";
import {
  operatorBrowserVisibleState,
  operatorBrowserChoices,
  operatorDefaultChoice,
  operatorBrowserQueryState,
  operatorChoiceState,
  operatorPaletteOpened,
} from "../recoil";
import { BROWSER_CONTROL_KEYS } from "../../constants";
import usePromptOperatorInput from "./usePromptOperatorInput";

/**
 * Custom hook for managing operator browser state and behavior.
 *
 * @returns Object containing operators, default operator, visibility state, and methods to open/close the browser.
 */

export default function useOperatorBrowser() {
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
      promptForInput({
        uriOrName: selectedOperator.value,
      });
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
        promptForInput({
          uriOrName: choice.value,
        });
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
