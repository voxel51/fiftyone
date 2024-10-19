import { useRecoilState, useRecoilValue } from "recoil";
import {
  operatorBrowserQueryState,
  operatorChoiceState,
  operatorDefaultChoice,
  operatorBrowserVisibleState,
} from "../recoil";

type OperatorBrowserState = {
  isVisible: boolean;
  query: string;
  selectedValue: string | null;
  setIsVisible: (visible: boolean) => void;
  setQuery: (query: string) => void;
  setSelected: (selected: string | null) => void;
};

/**
 * useOperatorBrowserState
 *
 * Manages the state of the operator browser.
 */
export default function useOperatorBrowserState(): OperatorBrowserState {
  const [isVisible, setIsVisible] = useRecoilState(operatorBrowserVisibleState);
  const [query, setQuery] = useRecoilState(operatorBrowserQueryState);
  const [selected, setSelected] = useRecoilState(operatorChoiceState);
  const defaultSelected = useRecoilValue(operatorDefaultChoice);

  const selectedValue = selected ?? defaultSelected;

  return {
    isVisible,
    query,
    selectedValue,
    setIsVisible,
    setQuery,
    setSelected,
  };
}
