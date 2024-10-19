import { useCallback } from "react";

type OperatorChoiceNavigation = {
  selectNext: () => void;
  selectPrevious: () => void;
};

/**
 * useOperatorChoiceNavigation
 *
 * Handles navigation between operator choices.
 *
 * @param choices - The list of available choices.
 * @param selectedValue - The currently selected value.
 * @param setSelected - Setter for the selected value.
 */
export default function useOperatorChoiceNavigation(
  choices: any[],
  selectedValue: string | null,
  setSelected: (value: string | null) => void
): OperatorChoiceNavigation {
  const getSelectedPrevAndNext = useCallback(() => {
    const selectedIndex = choices.findIndex(
      ({ value }) => value === selectedValue
    );
    const selected = choices[selectedIndex];
    const lastChoice = choices[choices.length - 1];
    const firstChoice = choices[0];

    if (selectedIndex === -1) {
      return {
        selected: null,
        selectedPrev: lastChoice?.value || null,
        selectedNext: firstChoice?.value || null,
      };
    }

    const selectedPrev = (choices[selectedIndex - 1] || lastChoice).value;
    const selectedNext = (choices[selectedIndex + 1] || firstChoice).value;

    return { selected, selectedPrev, selectedNext };
  }, [choices, selectedValue]);

  const selectNext = useCallback(() => {
    setSelected(getSelectedPrevAndNext().selectedNext);
  }, [setSelected, getSelectedPrevAndNext]);

  const selectPrevious = useCallback(() => {
    setSelected(getSelectedPrevAndNext().selectedPrev);
  }, [setSelected, getSelectedPrevAndNext]);

  return { selectNext, selectPrevious };
}
