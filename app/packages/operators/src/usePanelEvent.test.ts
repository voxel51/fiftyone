import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { RecoilRoot } from "recoil";
import usePanelEvent, { usePendingPanelEventError } from "./usePanelEvent";
import { PanelEventError } from "@fiftyone/utilities";

////////////////////////////
//   Mock dependencies    //
////////////////////////////

vi.mock("@fiftyone/spaces", () => ({
  usePanelStateByIdCallback: vi.fn((cb) => (panelId, options) => cb(panelId, undefined, [options])),
}));
vi.mock("@fiftyone/state", () => ({ useNotification: vi.fn() }));
vi.mock("./hooks", () => ({ useActivePanelEventsCount: vi.fn() }));
vi.mock("./operators", async () => {
  const actual = await vi.importActual("./operators");
  return { ...actual, executeOperator: vi.fn() };
});
vi.mock("./state", () => ({ usePromptOperatorInput: vi.fn() }));

import { useActivePanelEventsCount } from "./hooks";
import { executeOperator, OperatorResult } from "./operators";

const TestWrapper = ({ children }: { children: React.ReactNode }) => React.createElement(RecoilRoot, null, children);

// NOTE: useActivePanelEventsCount has browser dependencies in its transitive dependencies
//       likely in "./hooks" so we need to mock it
const mockUseActivePanelEventsCount = vi.mocked(useActivePanelEventsCount);
// Mock executeOperator to avoid calling the actual operator, which isn't needed for this test
const mockExecuteOperator = vi.mocked(executeOperator);


let mockDecrement: any;

beforeEach(() => {
  vi.clearAllMocks();
  mockDecrement = vi.fn();
  mockUseActivePanelEventsCount.mockReturnValue({ increment: vi.fn(), decrement: mockDecrement, count: 0 });
});

////////////////////////////
//         Tests          //
////////////////////////////

describe("usePendingPanelEventError", () => {
  it("should throw an error if there is a pending error", () => {
    const { result } = renderHook(() => usePendingPanelEventError(), { wrapper: TestWrapper });
    
    expect(() => {
      act(() => {
        result.current.setPendingError({ message: "test", error: new Error("test"), operator: "test#event" });
      });
    }).toThrow(PanelEventError);
  });

  it("should throw a properly formatted PanelEventError", () => {
    const { result } = renderHook(() => usePendingPanelEventError(), { wrapper: TestWrapper });
    
    let thrownError: PanelEventError;
    try {
      act(() => {
        result.current.setPendingError({ 
          message: "Operation failed", 
          error: new Error("Something went wrong"), 
          operator: "test#event" 
        });
      });
    } catch (error) {
      thrownError = error as PanelEventError;
    }
    
    expect(thrownError!).toBeInstanceOf(PanelEventError);
    expect(thrownError!.message).toBe("Operation failed");
    expect(thrownError!.operator).toBe("test");
    expect(thrownError!.event).toBe("event");
    expect(thrownError!.stack).toContain("Something went wrong");
  });
});

describe("usePanelEvent", () => {
  it("should return a function", () => {
    const { result } = renderHook(() => usePanelEvent(), { wrapper: TestWrapper });
    
    expect(typeof result.current).toBe("function");
  });

  it("should call executeOperator", () => {
    const { result } = renderHook(() => usePanelEvent(), { wrapper: TestWrapper });

    act(() => {
      result.current("panelId", {
        operator: "test#event",
        params: { param: "value" },
        panelId: "panelId"
      });
    });

    expect(mockExecuteOperator).toHaveBeenCalledWith(
      "test#event",
      expect.objectContaining({
        param: "value",
        panel_id: "panelId"
      }),
      expect.objectContaining({
        callback: expect.any(Function)
      })
    );
  });

  it("should throw a PanelEventError if the operation results in an error", () => {
    const { result } = renderHook(() => usePanelEvent(), { wrapper: TestWrapper });

    mockExecuteOperator.mockImplementation(async (uri, params, options) => {
      options.callback(OperatorResult.create({error: 'fail'}), {ctx: null});
    });

    let thrownError: PanelEventError;
    try {
      act(() => {
        result.current("panelId", {
          operator: "test#event",
          params: { param: "value" },
          panelId: "panelId"
        });
      });
    } catch (error) {
      thrownError = error as PanelEventError;
    }

    expect(thrownError).toBeInstanceOf(PanelEventError);  
  });
});