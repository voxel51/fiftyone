import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { RecoilRoot } from "recoil";
import usePanelEvent from "./usePanelEvent";

// Mock dependencies
vi.mock("@fiftyone/spaces", () => ({
  usePanelStateByIdCallback: vi.fn(),
}));
vi.mock("@fiftyone/state", () => ({
  useNotification: vi.fn(),
}));
vi.mock("./hooks", () => ({
  useActivePanelEventsCount: vi.fn(),
}));
vi.mock("./operators", () => ({
  executeOperator: vi.fn(),
}));
vi.mock("./state", () => ({
  usePromptOperatorInput: vi.fn(),
}));

import { usePanelStateByIdCallback } from "@fiftyone/spaces";
import { useActivePanelEventsCount } from "./hooks";

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  return React.createElement(RecoilRoot, null, children);
};

describe("usePanelEvent", () => {
  const mockUsePanelStateByIdCallback = vi.mocked(usePanelStateByIdCallback);
  const mockUseActivePanelEventsCount = vi.mocked(useActivePanelEventsCount);
  let mockCallback: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePanelStateByIdCallback.mockImplementation((callback) => {
      mockCallback = callback;
      return vi.fn();
    });
    mockUseActivePanelEventsCount.mockReturnValue({
      increment: vi.fn(),
      decrement: vi.fn(),
      count: 0,
    });
  });

  it("should return a function from usePanelStateByIdCallback", () => {
    renderHook(() => usePanelEvent(), {
      wrapper: TestWrapper,
    });
    expect(mockUsePanelStateByIdCallback).toHaveBeenCalledWith(
      expect.any(Function)
    );
    expect(typeof mockCallback).toBe("function");
  });
});
