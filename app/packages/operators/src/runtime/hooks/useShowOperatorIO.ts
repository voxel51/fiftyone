import { useCallback } from "react";
import { useRecoilState } from "recoil";
import { operatorIOState } from "../recoil";

type OperatorIOState = {
  isInput?: boolean;
  isOutput?: boolean;
  hideButtons?: boolean;
  validationErrors?: any[];
  schema?: object;
  data?: object;
  visible: boolean;
};

type UseShowOperatorIOReturn = {
  visible: boolean;
  showButtons: boolean;
  type: "input" | "output";
  show: (params: Omit<OperatorIOState, "visible">) => void;
  hide: () => void;
};

/**
 * useShowOperatorIO
 *
 * A hook to manage the visibility and state of the operator IO panel.
 *
 * @returns {UseShowOperatorIOReturn} - An object with control functions for showing and hiding the IO panel.
 */
export default function useShowOperatorIO(): UseShowOperatorIOReturn {
  const [state, setState] = useRecoilState<OperatorIOState>(operatorIOState);

  const show = useCallback(
    (params: Omit<OperatorIOState, "visible">) => {
      setState({ ...params, visible: true });
    },
    [setState]
  );

  const hide = useCallback(() => {
    setState({ ...state, visible: false });
  }, [setState, state]);

  return {
    visible: state.visible,
    showButtons: state.hideButtons !== true && state.isInput === true,
    type: state.isInput ? "input" : "output",
    show,
    hide,
  };
}
