import { atom, useRecoilState, useRecoilValue } from "recoil";

export type RuntimeLoaderState = "loading" | "error" | "ready";

export const pluginsLoaderAtom = atom<RuntimeLoaderState>({
  key: "pluginsLoaderAtom",
  default: "loading",
});

export const operatorsLoaderAtom = atom<RuntimeLoaderState>({
  key: "operatorsLoaderAtom",
  default: "loading",
});

/**
 * Registration state of the operator system, owned here rather than by
 * `@fiftyone/operators` so runtime status is derivable from one place. The
 * operator loader is its only writer.
 */
export function useOperatorsLoaderState() {
  return useRecoilState(operatorsLoaderAtom);
}

/** Status of the plugin bundle load alone, excluding operator registration. */
export function usePluginsStatus() {
  const state = useRecoilValue(pluginsLoaderAtom);
  return {
    isLoading: state === "loading",
    hasError: state === "error",
    ready: state === "ready",
  };
}
