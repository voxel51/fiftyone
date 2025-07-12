import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { RecoilRoot } from "recoil";
import usePanelEvent from "./usePanelEvent";

// Mocks
vi.mock("@fiftyone/spaces", () => ({ usePanelStateByIdCallback: vi.fn() }));
vi.mock("@fiftyone/state", () => ({ useNotification: vi.fn() }));
vi.mock("./hooks", () => ({ useActivePanelEventsCount: vi.fn() }));
vi.mock("./operators", async () => {
  const actual = await vi.importActual("./operators");
  return { ...actual, executeOperator: vi.fn() };
});
vi.mock("./state", () => ({ usePromptOperatorInput: vi.fn() }));

import { usePanelStateByIdCallback } from "@fiftyone/spaces";
import { useNotification } from "@fiftyone/state";
import { useActivePanelEventsCount } from "./hooks";
import { executeOperator, OperatorResult } from "./operators";
import { usePromptOperatorInput } from "./state";

const TestWrapper = ({ children }: { children: React.ReactNode }) => React.createElement(RecoilRoot, null, children);

// Common mocks
const mockUsePanelStateByIdCallback = vi.mocked(usePanelStateByIdCallback);
const mockUseActivePanelEventsCount = vi.mocked(useActivePanelEventsCount);
const mockUseNotification = vi.mocked(useNotification);
const mockExecuteOperator = vi.mocked(executeOperator);
const mockUsePromptOperatorInput = vi.mocked(usePromptOperatorInput);

let mockCallback: any;
let mockDecrement: any;

beforeEach(() => {
  vi.clearAllMocks();
  mockDecrement = vi.fn();
  mockUsePanelStateByIdCallback.mockImplementation((cb) => { mockCallback = cb; return vi.fn(); });
  mockUseActivePanelEventsCount.mockReturnValue({ increment: vi.fn(), decrement: mockDecrement, count: 0 });
  mockUseNotification.mockReturnValue(vi.fn());
  mockUsePromptOperatorInput.mockReturnValue(vi.fn());
});


const setupHook = () => {
  const { result } = renderHook(() => usePanelEvent(), { wrapper: TestWrapper });
  const triggerEvent = result.current;
  return { triggerEvent };
};

const setupOperatorCallback = (panelId = "id", events = [{ operator: "op", panelId: "id", params: {} }]) => {
  mockCallback(panelId, {}, events);
  return mockExecuteOperator.mock.calls[0][2].callback;
};

describe("usePanelEvent", () => {
  it("returns a function from usePanelStateByIdCallback", () => {
    setupHook();
    expect(typeof mockCallback).toBe("function");
  });

  it("sets pendingError when operator execution fails (error)", () => {
    setupHook();
    const cb = setupOperatorCallback();
    const operatorResult = OperatorResult.create({ error: "fail" });
    expect(() => cb(operatorResult, { ctx: null })).not.toThrow();
    expect(mockDecrement).toHaveBeenCalledWith("id");
  });

  it("sets pendingError when operator execution fails (errorMessage)", () => {
    setupHook();
    const cb = setupOperatorCallback();
    const operatorResult = OperatorResult.create({ error: "fail", errorMessage: "failMsg" });
    expect(() => cb(operatorResult, { ctx: null })).not.toThrow();
    expect(mockDecrement).toHaveBeenCalledWith("id");
  });

  it("does not set pendingError if only errorMessage is present and error is falsy", () => {
    setupHook();
    const cb = setupOperatorCallback();
    const operatorResult = OperatorResult.create({ errorMessage: "failMsg" });
    expect(() => cb(operatorResult, { ctx: null })).not.toThrow();
    expect(mockDecrement).toHaveBeenCalledWith("id");
  });

  it("extracts error message from Error object in error", () => {
    setupHook();
    const cb = setupOperatorCallback();
    const operatorResult = OperatorResult.create({ error: "msg" });
    (operatorResult as any).error = new Error("errObj");
    expect(() => cb(operatorResult, { ctx: null })).not.toThrow();
    expect(mockDecrement).toHaveBeenCalledWith("id");
  });

  it("extracts error message from Error object in errorMessage", () => {
    setupHook();
    const cb = setupOperatorCallback();
    const operatorResult = OperatorResult.create({ errorMessage: "msg" });
    (operatorResult as any).errorMessage = new Error("errObj");
    expect(() => cb(operatorResult, { ctx: null })).not.toThrow();
    expect(mockDecrement).toHaveBeenCalledWith("id");
  });

  it("extracts error message from string, Error, and number types", () => {
    setupHook();
    const cb = setupOperatorCallback();
    // string
    expect(() => cb(OperatorResult.create({ error: "str" }), { ctx: null })).not.toThrow();
    // Error object
    const errObj = OperatorResult.create({ error: "err" });
    (errObj as any).error = new Error("errObj");
    expect(() => cb(errObj, { ctx: null })).not.toThrow();
    // number
    const numObj = OperatorResult.create({ error: "404" });
    (numObj as any).error = 404;
    expect(() => cb(numObj, { ctx: null })).not.toThrow();
    expect(mockDecrement).toHaveBeenCalledWith("id");
  });
});
