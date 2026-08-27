import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  available: false,
  executeOperator: vi.fn(),
  resetState: vi.fn(),
  setState: vi.fn(),
}));

vi.mock("@fiftyone/operators", () => ({
  executeOperator: mocks.executeOperator,
  useOperatorAvailability: vi.fn(() => mocks.available),
}));

vi.mock("@fiftyone/state", () => ({
  datasetName: "datasetName",
}));

vi.mock("@fiftyone/utilities", () => ({
  toSlug: (value: string) => value.toLowerCase(),
}));

vi.mock("recoil", () => ({
  useRecoilState: vi.fn(() => [
    { dataset: "dataset", initialized: false, workspaces: [] },
    mocks.setState,
  ]),
  useRecoilValue: vi.fn(() => "dataset"),
  useResetRecoilState: vi.fn(() => mocks.resetState),
}));

vi.mock("../../state", () => ({
  savedWorkspacesAtom: "savedWorkspacesAtom",
}));

import { useWorkspaces } from "./hooks";

describe("useWorkspaces operator readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.available = false;
  });

  it("waits locally for list_workspaces to become available", () => {
    const { result, rerender } = renderHook(() => useWorkspaces());

    expect(result.current.canInitialize).toBe(false);
    act(() => result.current.listWorkspace());
    expect(mocks.executeOperator).not.toHaveBeenCalled();

    mocks.available = true;
    rerender();
    expect(result.current.canInitialize).toBe(true);

    act(() => result.current.listWorkspace());
    expect(mocks.executeOperator).toHaveBeenCalledWith(
      "@voxel51/operators/list_workspaces",
      {},
      expect.objectContaining({ skipOutput: true }),
    );
  });
});
