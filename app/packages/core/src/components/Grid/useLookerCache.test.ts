import { act, renderHook } from "@testing-library/react-hooks";
import { describe, expect, it } from "vitest";
import useLookerCache from "./useLookerCache";

class Looker extends EventTarget {
  destroy = () => undefined;
  getSizeBytesEstimate = () => 1;
  loaded: boolean;
}

describe("useLookerCache", () => {
  it("assert loaded, loading, and visible cache states and transitions", () => {
    const { result, rerender } = renderHook(
      (reset) => useLookerCache<Looker>(reset),
      {
        initialProps: "one",
      }
    );
    expect(result.current.loaded.size).toBe(0);
    expect(result.current.loading.size).toBe(0);
    expect(result.current.visible.size).toBe(0);
    expect(result.current.loaded.calculatedSize).toBe(0);

    act(() => {
      const looker = new Looker();
      result.current.set("one", looker);
    });

    expect(result.current.loaded.size).toBe(0);
    expect(result.current.loading.size).toBe(0);
    expect(result.current.visible.size).toBe(1);
    expect(result.current.loaded.calculatedSize).toBe(0);

    act(() => {
      result.current.hide("one");
    });

    expect(result.current.loaded.size).toBe(0);
    expect(result.current.loading.size).toBe(1);
    expect(result.current.visible.size).toBe(0);
    expect(result.current.loaded.calculatedSize).toBe(0);

    act(() => {
      const looker = result.current.get("one");
      if (!looker) {
        throw new Error("looker is missing");
      }

      looker.dispatchEvent(new Event("load"));
    });

    expect(result.current.loaded.size).toBe(1);
    expect(result.current.loading.size).toBe(0);
    expect(result.current.visible.size).toBe(0);
    expect(result.current.loaded.calculatedSize).toBe(1);

    rerender("two");
    expect(result.current.loaded.size).toBe(0);
    expect(result.current.loading.size).toBe(0);
    expect(result.current.visible.size).toBe(0);
    expect(result.current.loaded.calculatedSize).toBe(0);
  });
});
