import { renderHook } from "@testing-library/react";
import { atom, RecoilRoot, useSetRecoilState } from "recoil";
import { describe, expect, it, vi } from "vitest";
import useExecutionContext from "./useExecutionContext";
import { ExecutionContext } from "../operators";
import { promptingOperatorState } from "../recoil";

vi.mock(
  "@fiftyone/state",
  async () => await import("../__mocks__/@fiftyone/state")
);

// Simplified test for useExecutionContext
describe("useExecutionContext", () => {
  it("should create an execution context with the provided operator name", () => {
    // Arrange
    const operatorName = "testOperator";
    const mockHooks = { someHook: vi.fn() };

    // Act
    const { result } = renderHook(
      () => useExecutionContext(operatorName, mockHooks),
      {
        wrapper: ({ children }) => (
          <RecoilRoot
            initializeState={({ set }) => {
              set(promptingOperatorState, {
                params: { param1: "mockValue" },
              });
            }}
          >
            {children}
          </RecoilRoot>
        ),
      }
    );

    // Assert
    expect(result.current).toBeInstanceOf(ExecutionContext);
    expect(result.current.params).toEqual({ param1: "mockValue" });
    expect(result.current.hooks).toEqual(mockHooks);
  });
});
