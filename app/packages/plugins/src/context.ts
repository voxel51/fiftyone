import {
  createContext,
  createElement,
  useContext,
  type PropsWithChildren,
} from "react";
import { selector } from "recoil";
import type { PluginRuntimeHostContext } from "./Runtime/types";

function useEmptySpacesContext() {
  return {};
}

const emptyContextSelector = selector({
  key: "emptyContextSelector",
  get: () => ({}),
});

const defaultHostContext: PluginRuntimeHostContext = {
  operatorContextSelector: emptyContextSelector,
  useSpacesContext: useEmptySpacesContext,
};

const PluginRuntimeHostContext =
  createContext<PluginRuntimeHostContext>(defaultHostContext);

export function PluginRuntimeHostContextProvider({
  children,
  value,
}: PropsWithChildren<{ value: Partial<PluginRuntimeHostContext> }>) {
  return createElement(
    PluginRuntimeHostContext.Provider,
    { value: { ...defaultHostContext, ...value } },
    children,
  );
}

function usePluginRuntimeHostContext() {
  return useContext(PluginRuntimeHostContext);
}

export function useOperatorContextSelector() {
  return usePluginRuntimeHostContext().operatorContextSelector;
}

export function useSpacesContext() {
  return usePluginRuntimeHostContext().useSpacesContext;
}
