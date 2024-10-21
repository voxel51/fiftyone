import { useState, useEffect, useMemo } from "react";
import { SubmitOption } from "../types";

type UseOperatorSubmitOptionsStateReturn = {
  options: SubmitOption[];
  selectedID: string;
  setOptions: (options: SubmitOption[]) => void;
  setSelectedID: (id: string) => void;
};

/**
 * useOperatorSubmitOptionsState
 *
 * Manages the state of submission options and the selected ID.
 */
export default function useOperatorSubmitOptionsState(
  initialOptions: SubmitOption[] = []
): UseOperatorSubmitOptionsStateReturn {
  const [options, setOptions] = useState<SubmitOption[]>(initialOptions);
  const [selectedID, setSelectedID] = useState<string>(
    () =>
      options.find((option) => option.default)?.id ||
      options[0]?.id ||
      "execute"
  );

  useEffect(() => {
    if (options.length === 1) {
      setSelectedID(options[0].id);
    }
  }, [options]);

  return useMemo(
    () => ({
      options,
      selectedID,
      setOptions,
      setSelectedID,
    }),
    [options, selectedID, setOptions, setSelectedID]
  );
}
