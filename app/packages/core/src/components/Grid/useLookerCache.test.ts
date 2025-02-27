import { act, renderHook } from "@testing-library/react-hooks";
import { describe, expect, it } from "vitest";
import useLookerCache from "./useLookerCache";

class Looker extends EventTarget {
  destroy = () => undefined;
  getSizeBytesEstimate = () => 1;
  loaded: boolean;
}

describe("useLookerCache", () => {
  it("assert loaded, pending, and shown cache states and transitions", () => {
    const { result, rerender } = renderHook(
      (reset) =>
        useLookerCache<Looker>({
          reset,
          maxHiddenItems: 2,
          maxHiddenItemsSizeBytes: 2,
        }),
      {
        initialProps: "one",
      }
    );
    expect(result.current.hidden.size).toBe(0);
    expect(result.current.pending.size).toBe(0);
    expect(result.current.shown.size).toBe(0);
    expect(result.current.hidden.calculatedSize).toBe(0);

    act(() => {
      const looker = new Looker();
      result.current.set("one", looker);
    });

    expect(result.current.hidden.size).toBe(0);
    expect(result.current.pending.size).toBe(0);
    expect(result.current.shown.size).toBe(1);
    expect(result.current.hidden.calculatedSize).toBe(0);

    act(() => {
      result.current.hide("one");
    });

    expect(result.current.hidden.size).toBe(0);
    expect(result.current.pending.size).toBe(1);
    expect(result.current.shown.size).toBe(0);
    expect(result.current.hidden.calculatedSize).toBe(0);

    act(() => {
      const looker = result.current.get("one");
      if (!looker) {
        throw new Error("looker is missing");
      }

      looker.dispatchEvent(new Event("load"));
    });

    expect(result.current.hidden.size).toBe(1);
    expect(result.current.pending.size).toBe(0);
    expect(result.current.shown.size).toBe(0);
    expect(result.current.hidden.calculatedSize).toBe(1);

    rerender("two");
    expect(result.current.hidden.size).toBe(0);
    expect(result.current.pending.size).toBe(0);
    expect(result.current.shown.size).toBe(0);
    expect(result.current.hidden.calculatedSize).toBe(0);
  });
});
