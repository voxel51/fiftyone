import { selector } from "recoil";
import type { OperatorContextSelector } from "./Runtime/types";

let useSpacesContext: (() => unknown) | undefined;
let useOperatorsContext: (() => unknown) | undefined;

function useEmptyContext() {
  return {};
}

export function setContextHook(
  type: "operators" | "spaces",
  hook: (() => unknown) | undefined,
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

let operatorsContextSelector: OperatorContextSelector | undefined;

const emptyContextSelector = selector({
  key: "emptyContextSelector",
  get: ({}) => {
    return {};
  },
});

export function setContextSelector(
  type: "operators" | "spaces",
  selector: OperatorContextSelector | undefined,
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
