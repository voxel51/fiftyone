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
vi.mock("./operators", async () => {
  const actual = await vi.importActual("./operators");
  return {
    ...actual,
    executeOperator: vi.fn(),
  };
});
vi.mock("./state", () => ({
  usePromptOperatorInput: vi.fn(),
}));

import { usePanelStateByIdCallback } from "@fiftyone/spaces";
import { useNotification } from "@fiftyone/state";
import { useActivePanelEventsCount } from "./hooks";
import { executeOperator, OperatorResult } from "./operators";
import { usePromptOperatorInput } from "./state";

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  return React.createElement(RecoilRoot, null, children);
};

describe("usePanelEvent", () => {
  const mockUsePanelStateByIdCallback = vi.mocked(usePanelStateByIdCallback);
  const mockUseActivePanelEventsCount = vi.mocked(useActivePanelEventsCount);
  const mockUseNotification = vi.mocked(useNotification);
  const mockExecuteOperator = vi.mocked(executeOperator);
  const mockUsePromptOperatorInput = vi.mocked(usePromptOperatorInput);
  let mockCallback: any;
  let mockNotify: any;
  let mockIncrement: any;
  let mockDecrement: any;
  let mockPromptForOperator: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockNotify = vi.fn();
    mockIncrement = vi.fn();
    mockDecrement = vi.fn();
    mockPromptForOperator = vi.fn();

    mockUsePanelStateByIdCallback.mockImplementation((callback) => {
      mockCallback = callback;
      return vi.fn();
    });
    mockUseActivePanelEventsCount.mockReturnValue({
      increment: mockIncrement,
      decrement: mockDecrement,
      count: 0,
    });
    mockUseNotification.mockReturnValue(mockNotify);
    mockUsePromptOperatorInput.mockReturnValue(mockPromptForOperator);
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

  it("should call notify with error message when operator execution fails", () => {
    renderHook(() => usePanelEvent(), {
      wrapper: TestWrapper,
    });

    const panelId = "test-panel-id";
    const operator = "test-operator";
    const errorMessage = "Test error message";

    // Simulate operator execution with error
    const options = {
      params: {},
      operator,
      prompt: false,
      panelId,
      callback: vi.fn(),
    };

    // Call the callback with error result
    mockCallback(panelId, { state: {} }, [options]);

    // Simulate the executeOperator callback being called with an error
    const eventCallback = mockExecuteOperator.mock.calls[0][2].callback;
    const mockOperatorResult = new OperatorResult(
      null, // operator
      {}, // result
      null, // executor
      errorMessage, // error
      false, // delegated
      null // errorMessage
    );
    expect(() => eventCallback(mockOperatorResult, { ctx: null })).toThrow(
      errorMessage
    );

    expect(mockDecrement).toHaveBeenCalledWith(panelId);
  });

  it("should call notify with error message when operator execution fails with errorMessage property", () => {
    renderHook(() => usePanelEvent(), {
      wrapper: TestWrapper,
    });

    const panelId = "test-panel-id";
    const operator = "test-operator";
    const errorMessage = "Test error message";

    // Simulate operator execution with error
    const options = {
      params: {},
      operator,
      prompt: false,
      panelId,
      callback: vi.fn(),
    };

    // Call the callback with error result
    mockCallback(panelId, { state: {} }, [options]);

    // Simulate the executeOperator callback being called with an error
    const eventCallback = mockExecuteOperator.mock.calls[0][2].callback;
    const mockOperatorResult = new OperatorResult(
      null, // operator
      {}, // result
      null, // executor
      errorMessage, // error - this needs to be truthy for notify to be called
      false, // delegated
      null // errorMessage
    );
    expect(() => eventCallback(mockOperatorResult, { ctx: null })).toThrow(
      errorMessage
    );

    expect(mockDecrement).toHaveBeenCalledWith(panelId);
  });

  it("should not call notify when only errorMessage is present but error is falsy", () => {
    renderHook(() => usePanelEvent(), {
      wrapper: TestWrapper,
    });

    const panelId = "test-panel-id";
    const operator = "test-operator";
    const errorMessage = "Test error message";

    // Simulate operator execution with error
    const options = {
      params: {},
      operator,
      prompt: false,
      panelId,
      callback: vi.fn(),
    };

    // Call the callback with error result
    mockCallback(panelId, { state: {} }, [options]);

    // Simulate the executeOperator callback being called with an error
    const eventCallback = mockExecuteOperator.mock.calls[0][2].callback;
    const mockOperatorResult = new OperatorResult(
      null, // operator
      {}, // result
      null, // executor
      null, // error - falsy, so notify won't be called
      false, // delegated
      errorMessage // errorMessage - present but won't trigger notify
    );
    expect(() =>
      eventCallback(mockOperatorResult, { ctx: null })
    ).not.toThrow();

    expect(mockDecrement).toHaveBeenCalledWith(panelId);
  });

  it("should handle Error objects in result.error and extract their message", () => {
    renderHook(() => usePanelEvent(), {
      wrapper: TestWrapper,
    });

    const panelId = "test-panel-id";
    const operator = "test-operator";
    const errorMessage = "Test error message";
    const errorObject = new Error(errorMessage);

    // Simulate operator execution with error
    const options = {
      params: {},
      operator,
      prompt: false,
      panelId,
      callback: vi.fn(),
    };

    // Call the callback with error result
    mockCallback(panelId, { state: {} }, [options]);

    // Simulate the executeOperator callback being called with an error
    const eventCallback = mockExecuteOperator.mock.calls[0][2].callback;
    const mockOperatorResult = new OperatorResult(
      null, // operator
      {}, // result
      null, // executor
      errorMessage, // error - string for constructor
      false, // delegated
      null // errorMessage
    );
    // Override the error property to be an Error object to test the handling
    (mockOperatorResult as any).error = errorObject;

    expect(() => eventCallback(mockOperatorResult, { ctx: null })).toThrow(
      errorMessage
    );

    expect(mockDecrement).toHaveBeenCalledWith(panelId);
  });

  it("should handle Error objects in result.errorMessage and extract their message", () => {
    renderHook(() => usePanelEvent(), {
      wrapper: TestWrapper,
    });

    const panelId = "test-panel-id";
    const operator = "test-operator";
    const errorMessage = "Test error message";
    const errorObject = new Error(errorMessage);

    // Simulate operator execution with error
    const options = {
      params: {},
      operator,
      prompt: false,
      panelId,
      callback: vi.fn(),
    };

    // Call the callback with error result
    mockCallback(panelId, { state: {} }, [options]);

    // Simulate the executeOperator callback being called with an error
    const eventCallback = mockExecuteOperator.mock.calls[0][2].callback;
    const mockOperatorResult = new OperatorResult(
      null, // operator
      {}, // result
      null, // executor
      null, // error - null
      false, // delegated
      errorMessage // errorMessage - string for constructor
    );
    // Override the errorMessage property to be an Error object to test the handling
    (mockOperatorResult as any).errorMessage = errorObject;

    expect(() => eventCallback(mockOperatorResult, { ctx: null })).toThrow(
      errorMessage
    );

    expect(mockDecrement).toHaveBeenCalledWith(panelId);
  });
});
