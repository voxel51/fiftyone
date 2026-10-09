import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import useRecords, { MAX_RECORDS } from "./useRecords";

describe("useRecords", () => {
  it("return new records when clear string changes", () => {
    const { result, rerender } = renderHook(
      (clear: string) => useRecords(clear),
      { initialProps: "one" },
    );
    expect(result.current.size).toBe(0);

    act(() => {
      result.current.set("one", 1);
    });

    expect(result.current.size).toBe(1);

    rerender("two");

    expect(result.current.size).toBe(0);
  });

  it("holds at most MAX_RECORDS samples however many are fetched", () => {
    const { result } = renderHook(() => useRecords("bounded"));
    for (let i = 0; i < MAX_RECORDS * 3; i++) result.current.set(`${i}`, i);
    expect(result.current.size).toBe(MAX_RECORDS);
  });
});
