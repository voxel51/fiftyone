import { act, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  available: false,
  closeSchemaManager: vi.fn(),
  execute: vi.fn(),
  result: null,
  setActive: vi.fn(),
  setActivePathsOrder: vi.fn(),
  setData: vi.fn(),
}));

vi.mock("@fiftyone/operators", () => ({
  useOperatorAvailability: vi.fn(() => mocks.available),
  useOperatorExecutor: vi.fn(() => ({
    execute: mocks.execute,
    result: mocks.result,
  })),
}));

vi.mock("jotai", () => ({
  useSetAtom: vi.fn((atom) => {
    if (atom === "activeLabelSchemas") return mocks.setActive;
    if (atom === "activePathsOrder") return mocks.setActivePathsOrder;
    return mocks.setData;
  }),
}));

vi.mock("./SchemaManager/hooks", () => ({
  useSchemaManagerModal: vi.fn(() => ({
    closeSchemaManager: mocks.closeSchemaManager,
  })),
}));

vi.mock("./state", () => ({
  activeLabelSchemas: "activeLabelSchemas",
  activePathsOrder: "activePathsOrder",
  labelSchemasData: "labelSchemasData",
}));

import useLoadSchemas from "./useLoadSchemas";

describe("useLoadSchemas operator readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.available = false;
    mocks.result = null;
  });

  it("retries schema loading when the operator registers", () => {
    const { rerender } = renderHook(() => {
      const loadSchemas = useLoadSchemas();
      useEffect(() => {
        loadSchemas();
      }, [loadSchemas]);
    });

    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.closeSchemaManager).not.toHaveBeenCalled();
    expect(mocks.setActivePathsOrder).not.toHaveBeenCalled();

    act(() => {
      mocks.available = true;
      rerender();
    });

    expect(mocks.setActivePathsOrder).toHaveBeenCalledWith(null);
    expect(mocks.closeSchemaManager).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledWith({});
  });
});
