import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  datasetName: "dataset-one",
  executeOperatorsForEvent: vi.fn(),
  initialized: false,
  loadOperatorsFromServer: vi.fn(),
  registerBuiltInOperators: vi.fn(),
  registerPanel: vi.fn(),
  setInitialized: vi.fn(),
  setRefreshCount: vi.fn(),
}));

vi.mock("@fiftyone/state", () => ({
  datasetName: "datasetName",
}));

vi.mock("@fiftyone/utilities", () => ({
  isPrimitiveString: (value: unknown) => typeof value === "string",
}));

vi.mock("recoil", () => ({
  useRecoilValue: vi.fn(() => mocks.datasetName),
  useSetRecoilState: vi.fn((atom) =>
    atom === "availableOperatorsRefreshCount"
      ? mocks.setRefreshCount
      : mocks.setInitialized,
  ),
}));

vi.mock("./built-in-operators", () => ({
  registerBuiltInOperators: mocks.registerBuiltInOperators,
}));

vi.mock("./hooks", () => ({
  useOperatorPlacementsResolver: vi.fn(() => ({
    initialized: mocks.initialized,
  })),
}));

vi.mock("./operators", () => ({
  executeOperatorsForEvent: mocks.executeOperatorsForEvent,
  loadOperatorsFromServer: mocks.loadOperatorsFromServer,
}));

vi.mock("./Panel/register", () => ({
  default: mocks.registerPanel,
}));

vi.mock("./state", () => ({
  availableOperatorsRefreshCount: "availableOperatorsRefreshCount",
  operatorsInitializedAtom: "operatorsInitializedAtom",
}));

import { useOperators } from "./loader";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
};

describe("useOperators lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.datasetName = "dataset-one";
    mocks.initialized = false;
  });

  it("publishes definitions before placements and does not await startup execution", async () => {
    const definitions = deferred<Array<{ panel_name: string }>>();
    const startupExecution = deferred<void>();
    mocks.loadOperatorsFromServer.mockReturnValueOnce(definitions.promise);
    mocks.executeOperatorsForEvent.mockReturnValue(startupExecution.promise);

    const { result, rerender } = renderHook(() => useOperators(false));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.ready).toBe(false);
    expect(mocks.executeOperatorsForEvent).not.toHaveBeenCalled();

    await act(async () => {
      definitions.resolve([{ panel_name: "panel" }]);
      await definitions.promise;
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.ready).toBe(false);
    expect(mocks.registerPanel).toHaveBeenCalledWith({ panel_name: "panel" });
    expect(mocks.executeOperatorsForEvent).toHaveBeenCalledWith(
      "onDatasetOpen",
    );
    expect(mocks.executeOperatorsForEvent).toHaveBeenCalledWith("onStartup");
    expect(mocks.setInitialized).toHaveBeenCalledWith(true);

    mocks.initialized = true;
    rerender();
    expect(result.current.ready).toBe(true);

    mocks.loadOperatorsFromServer.mockResolvedValueOnce([]);
    mocks.datasetName = "dataset-two";
    rerender();
    await waitFor(() =>
      expect(mocks.loadOperatorsFromServer).toHaveBeenCalledWith("dataset-two"),
    );
    await waitFor(() =>
      expect(mocks.executeOperatorsForEvent).toHaveBeenCalledTimes(3),
    );
    expect(
      mocks.executeOperatorsForEvent.mock.calls.filter(
        ([event]) => event === "onStartup",
      ),
    ).toHaveLength(1);
    expect(
      mocks.executeOperatorsForEvent.mock.calls.filter(
        ([event]) => event === "onDatasetOpen",
      ),
    ).toHaveLength(2);
  });
});
