import { act, renderHook } from "@testing-library/react-hooks";
import { describe, expect, it } from "vitest";
import useLookerCache from "./useLookerCache";

class Looker extends EventTarget {
  destroy = () => undefined;
  getSizeBytesEstimate = () => 1;
}

describe("useLookerCache", () => {
  it("assert intermediate loading", () => {
    const { result, rerender } = renderHook(
      (reset) => useLookerCache<Looker>(reset),
      {
        initialProps: "one",
      }
    );
    expect(result.current.loadedSize()).toBe(0);
    expect(result.current.loadingSize()).toBe(0);

    act(() => {
      const looker = new Looker();
      result.current.set("one", looker);
    });

    expect(result.current.loadingSize()).toBe(1);
    expect(result.current.loadedSize()).toBe(0);
    expect(result.current.sizeEstimate()).toBe(0);

    act(() => {
      const looker = result.current.get("one");
      if (!looker) {
        throw new Error("looker is missing");
      }

      looker.dispatchEvent(new Event("load"));
    });
    expect(result.current.loadingSize()).toBe(0);
    expect(result.current.loadedSize()).toBe(1);
    expect(result.current.sizeEstimate()).toBe(1);

    rerender("two");
    expect(result.current.loadedSize()).toBe(0);
    expect(result.current.loadingSize()).toBe(0);
    expect(result.current.sizeEstimate()).toBe(0);
  });
});
