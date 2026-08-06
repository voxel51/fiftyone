import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { Suspense, useEffect, type ReactNode } from "react";
import { RecoilRoot, useSetRecoilState } from "recoil";
import { afterEach, describe, expect, it } from "vitest";
import {
  pluginsLoaderAtom,
  useOperatorsLoaderState,
  type RuntimeLoaderState,
} from "./state";
import {
  PluginRuntimeGate,
  usePluginRuntimeReady,
  usePluginRuntimeStatus,
} from "./status";

function Loaders({
  children,
  operators,
  plugins,
}: {
  children: ReactNode;
  operators: RuntimeLoaderState;
  plugins: RuntimeLoaderState;
}) {
  const setPlugins = useSetRecoilState(pluginsLoaderAtom);
  const [, setOperators] = useOperatorsLoaderState();

  useEffect(() => {
    setPlugins(plugins);
    setOperators(operators);
  }, [operators, plugins, setOperators, setPlugins]);

  return <>{children}</>;
}

const runtime = (
  plugins: RuntimeLoaderState,
  operators: RuntimeLoaderState,
  children: ReactNode,
) => (
  <RecoilRoot>
    <Loaders plugins={plugins} operators={operators}>
      {children}
    </Loaders>
  </RecoilRoot>
);

function Dependent() {
  usePluginRuntimeReady();
  return <span>ready</span>;
}

afterEach(cleanup);

describe("plugin runtime status", () => {
  it.each([
    ["loading", "loading", { isLoading: true, hasError: false, ready: false }],
    ["ready", "loading", { isLoading: true, hasError: false, ready: false }],
    ["loading", "ready", { isLoading: true, hasError: false, ready: false }],
    ["ready", "ready", { isLoading: false, hasError: false, ready: true }],
    ["error", "ready", { isLoading: false, hasError: true, ready: false }],
    ["ready", "error", { isLoading: false, hasError: true, ready: false }],
  ] as const)(
    "derives status from plugins=%s operators=%s",
    (plugins, operators, expected) => {
      const { result } = renderHook(() => usePluginRuntimeStatus(), {
        wrapper: ({ children }) => runtime(plugins, operators, children),
      });

      expect(result.current).toEqual(expected);
    },
  );

  it("gates children on readiness", () => {
    const gate = (
      <PluginRuntimeGate fallback={<span>waiting</span>}>
        <span>ready</span>
      </PluginRuntimeGate>
    );

    const { rerender } = render(runtime("ready", "loading", gate));
    expect(screen.getByText("waiting")).toBeTruthy();

    rerender(runtime("ready", "ready", gate));
    expect(screen.getByText("ready")).toBeTruthy();
  });

  it("suspends dependents until both loaders are ready", async () => {
    const dependent = (
      <Suspense fallback={<span>waiting</span>}>
        <Dependent />
      </Suspense>
    );

    const { rerender } = render(runtime("loading", "loading", dependent));
    expect(screen.getByText("waiting")).toBeTruthy();

    rerender(runtime("ready", "loading", dependent));
    expect(screen.getByText("waiting")).toBeTruthy();

    rerender(runtime("ready", "ready", dependent));
    expect(await screen.findByText("ready")).toBeTruthy();
  });

  it("re-suspends dependents when a ready runtime reloads", async () => {
    const dependent = (
      <Suspense fallback={<span>waiting</span>}>
        <Dependent />
      </Suspense>
    );

    const { rerender } = render(runtime("ready", "ready", dependent));
    expect(await screen.findByText("ready")).toBeTruthy();

    rerender(runtime("ready", "loading", dependent));
    expect(screen.getByText("waiting")).toBeTruthy();

    rerender(runtime("ready", "ready", dependent));
    expect(await screen.findByText("ready")).toBeTruthy();
  });
});
