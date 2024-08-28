import { act, renderHook } from "@testing-library/react-hooks";
import { describe, expect, it } from "vitest";
import useRecords from "./useRecords";

describe("useRecords", () => {
  it("should clear records when clear string changes", () => {
    const { result, rerender } = renderHook(
      (clear: string) => useRecords(clear),
      { initialProps: "one" }
    );
    expect(result.current.current.size).toBe(0);

    act(() => {
      result.current.current.set("one", 1);
    });

    expect(result.current.current.size).toBe(1);

    rerender("two");

    expect(result.current.current.size).toBe(0);
  });
});
