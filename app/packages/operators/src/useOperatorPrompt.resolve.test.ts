import { act, renderHook } from "@testing-library/react";
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A promise the test settles by hand. */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** An operator's resolved inputs, as `resolveInput` answers them. */
const inputs = (view: string) => ({
  type: { properties: {} },
  toProps: () => ({ view }),
});

const env = vi.hoisted(() => ({
  params: {} as Record<string, unknown>,
  resolveInput: vi.fn(),
  resolveExecutionOptions: vi.fn(),
}));

vi.mock("recoil", () => {
  return {
    atom: vi.fn(({ key }: { key: string }) => ({ key })),
    selector: vi.fn(({ key }: { key: string }) => ({ key })),
    selectorFamily: vi.fn(({ key }: { key: string }) => () => ({ key })),
    useRecoilCallback: vi.fn(),
    useRecoilState: ({ key }: { key: string }) =>
      key === "promptingOperator"
        ? [{ operatorName: "@test/op", id: "prompt", params: env.params }]
        : [null, vi.fn()],
    useRecoilTransaction_UNSTABLE: () => vi.fn(),
    useRecoilValue: ({ key }: { key: string }) =>
      key === "currentContextSelector" ? { params: env.params } : null,
    useRecoilValueLoadable: () => ({ state: "hasValue", contents: null }),
    useSetRecoilState: () => vi.fn(),
  };
});
vi.mock("@fiftyone/analytics", () => ({ useAnalyticsInfo: () => [null] }));
vi.mock("@fiftyone/components", () => ({
  Markdown: ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", null, children),
}));
vi.mock("@fiftyone/state", () => ({
  useBrowserStorage: (_key: string, defaultValue: unknown) =>
    useState(defaultValue),
  useNotification: () => vi.fn(),
  getBrowserStorageEffectForKey: () => () => undefined,
  modal: null,
  datasetName: null,
  view: null,
  extendedStages: null,
  filters: null,
  selectedSamples: null,
  selectedLabels: null,
  viewName: null,
  extendedSelection: null,
  groupSlice: null,
  queryPerformance: null,
  sessionSpaces: null,
  activeFields: () => null,
  currentSampleId: null,
  editingFieldAtom: null,
}));
vi.mock("./operators", () => ({
  ExecutionContext: class {
    constructor(readonly params: unknown) {}
  },
  OperatorResult: vi.fn(),
  getLocalOrRemoteOperator: () => ({
    isRemote: true,
    operator: {
      uri: "@test/op",
      isRemote: true,
      config: { dynamic: true, resolveExecutionOptionsOnChange: true },
      resolveInput: env.resolveInput,
      useHooks: () => ({}),
      needsUserInput: async () => true,
      needsResolution: () => true,
    },
  }),
  resolveExecutionOptions: env.resolveExecutionOptions,
  resolveOperatorURI: (uri: string) => uri,
}));
vi.mock("./utils", () => ({
  generateOperatorSessionId: () => "session",
  optimizeCtx: (ctx: unknown) => ctx,
  stringifyError: vi.fn(),
  onEnter: (fn: unknown) => fn,
}));
vi.mock("./validation", () => ({
  ValidationContext: class {
    invalid = false;
    toProps = () => ({ errors: [] });
  },
}));

import { RESOLVE_TYPE_TTL } from "./constants";
import { useOperatorPrompt } from "./state";

describe("useOperatorPrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    env.params = { brain_key: "old" };
    env.resolveInput.mockReset();
    env.resolveExecutionOptions.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  /** Renders the prompt, then edits its params while the first resolve is
   * still in flight, so a second resolve is issued; answers each as told. */
  const editDuringResolve = async () => {
    const first = deferred<ReturnType<typeof inputs>>();
    const second = deferred<ReturnType<typeof inputs>>();
    env.resolveInput
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const prompt = renderHook(() => useOperatorPrompt());
    await act(async () => undefined);
    expect(env.resolveInput).toHaveBeenCalledTimes(1);

    env.params = { brain_key: "new" };
    prompt.rerender();
    await act(async () => vi.advanceTimersByTime(RESOLVE_TYPE_TTL));
    expect(env.resolveInput).toHaveBeenCalledTimes(2);
    return { prompt, first, second };
  };

  it("settles on the newest params when an older resolve answers last", async () => {
    const { prompt, first, second } = await editDuringResolve();

    await act(async () => second.resolve(inputs("new")));
    await act(async () => first.resolve(inputs("old")));
    await act(async () => vi.runOnlyPendingTimers());

    expect(prompt.result.current.resolving).toBe(false);
    expect(prompt.result.current.inputFields).toEqual({ view: "new" });
  });

  it("keeps the newest inputs when an older resolve fails last", async () => {
    const { prompt, first, second } = await editDuringResolve();

    await act(async () => second.resolve(inputs("new")));
    await act(async () => first.reject(new Error("stale")));
    await act(async () => vi.runOnlyPendingTimers());

    expect(prompt.result.current.resolving).toBe(false);
    expect(prompt.result.current.inputFields).toEqual({ view: "new" });
  });

  it("keeps the newest execution options when an older request answers last", async () => {
    const requests: ReturnType<typeof deferred<unknown>>[] = [];
    env.resolveExecutionOptions.mockImplementation(() => {
      const request = deferred<unknown>();
      requests.push(request);
      return request.promise;
    });
    const { prompt, first, second } = await editDuringResolve();
    await act(async () => vi.runOnlyPendingTimers());
    expect(requests.length).toBeGreaterThanOrEqual(2);

    const newest = requests[requests.length - 1];
    await act(async () => newest.resolve({ allowDelegatedExecution: true }));
    for (const older of requests.slice(0, -1)) {
      await act(async () => older.resolve({ allowImmediateExecution: true }));
    }
    await act(async () => second.resolve(inputs("new")));
    await act(async () => first.resolve(inputs("old")));

    expect(prompt.result.current.execDetails.executionOptions).toEqual({
      allowDelegatedExecution: true,
    });
  });
});
