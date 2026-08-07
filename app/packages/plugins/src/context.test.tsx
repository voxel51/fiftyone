import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { selector } from "recoil";
import { describe, expect, it } from "vitest";
import {
  PluginRuntimeHostContextProvider,
  useOperatorContextSelector,
  useSpacesContext,
} from "./context";

describe("PluginRuntimeHostContextProvider", () => {
  it("provides the runtime operator selector and spaces hook", () => {
    const operatorContextSelector = selector({
      key: "pluginRuntimeHostContextTest",
      get: () => ({ datasetName: "dataset" }),
    });
    const useHostSpacesContext = () => ({ spaces: "workspace" });
    const wrapper = ({ children }: PropsWithChildren) => (
      <PluginRuntimeHostContextProvider
        value={{
          operatorContextSelector,
          useSpacesContext: useHostSpacesContext,
        }}
      >
        {children}
      </PluginRuntimeHostContextProvider>
    );

    const { result } = renderHook(
      () => {
        const useRuntimeSpacesContext = useSpacesContext();
        return {
          operatorContextSelector: useOperatorContextSelector(),
          spacesContext: useRuntimeSpacesContext(),
        };
      },
      { wrapper },
    );

    expect(result.current.operatorContextSelector).toBe(
      operatorContextSelector,
    );
    expect(result.current.spacesContext).toEqual({ spaces: "workspace" });
  });

  it("uses empty fallbacks when the host omits dependencies", () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <PluginRuntimeHostContextProvider value={{}}>
        {children}
      </PluginRuntimeHostContextProvider>
    );

    const { result } = renderHook(
      () => {
        const useRuntimeSpacesContext = useSpacesContext();
        return {
          operatorContextSelector: useOperatorContextSelector(),
          spacesContext: useRuntimeSpacesContext(),
        };
      },
      { wrapper },
    );

    expect(result.current.operatorContextSelector).toBeDefined();
    expect(result.current.spacesContext).toEqual({});
  });
});
