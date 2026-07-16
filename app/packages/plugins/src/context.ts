import { selector } from "recoil";

let useSpacesContext: () => unknown;
let useOperatorsContext: () => unknown;

function useEmptyContext() {
  return {};
}

export function setContextHook(
  type: "operators" | "spaces",
  hook: () => unknown,
) {
  if (type === "operators") {
    useOperatorsContext = hook;
  }
  if (type === "spaces") {
    useSpacesContext = hook;
  }
}

export function useContextHook(type: "operators" | "spaces") {
  if (type === "operators") {
    return useOperatorsContext || useEmptyContext;
  }
  if (type === "spaces") {
    return useSpacesContext || useEmptyContext;
  }
  return useEmptyContext;
}

let operatorsContextSelector;

const emptyContextSelector = selector({
  key: "emptyContextSelector",
  get: ({}) => {
    return {};
  },
});

export function setContextSelector(
  type: "operators" | "spaces",
  selector: unknown,
) {
  if (type === "operators") {
    operatorsContextSelector = selector;
  }
}

export function getContextSelector(type: "operators" | "spaces") {
  if (type === "operators") {
    return operatorsContextSelector || emptyContextSelector;
  }
  return emptyContextSelector;
}
