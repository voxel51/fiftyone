import { useEffect, useRef } from "react";

/**
 * The hook can be used to get the latest value of the state without
 * re-rendering the component.
 */
export function useUnboundState<State>(value: State): State {
  const stateRef = useRef({} as State);

  useEffect(() => {
    stateRef.current = value;
  }, [value]);

  return stateRef.current;
}
