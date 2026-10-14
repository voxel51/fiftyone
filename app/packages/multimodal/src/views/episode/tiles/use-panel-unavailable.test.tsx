import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePanelUnavailable } from "./use-panel-unavailable";

afterEach(cleanup);

describe("usePanelUnavailable", () => {
  it("applies a panel report only to the scope it was made for", () => {
    const { result, rerender } = renderHook(
      ({ scopeKey }) => usePanelUnavailable(scopeKey),
      { initialProps: { scopeKey: "a" } },
    );
    const reportForA = result.current.onUnavailableChange;
    act(() => reportForA(true));
    expect(result.current.unavailable).toBe(true);
    rerender({ scopeKey: "b" });
    expect(result.current.unavailable).toBe(false);
    act(() => reportForA(false));
    act(() => result.current.onUnavailableChange(true));
    expect(result.current.unavailable).toBe(true);
    act(() => reportForA(false));
    expect(result.current.unavailable).toBe(true);
  });
});
