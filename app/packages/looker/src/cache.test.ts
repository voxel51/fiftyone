import { act } from "@testing-library/react-hooks";
import { describe, expect, it } from "vitest";
import { createCache } from "./cache";

class Looker extends EventTarget {
  destroy = () => undefined;
  getSizeBytesEstimate = () => 1;
  loaded: boolean;
}

describe("useLookerCache", () => {
  it("assert loaded, pending, and shown cache states and transitions", () => {
    const cache = createCache<Looker>({
      maxHiddenItems: 2,
      maxHiddenItemsSizeBytes: 2,
    });
    expect(cache.hidden.size).toBe(0);
    expect(cache.pending.size).toBe(0);
    expect(cache.shown.size).toBe(0);
    expect(cache.hidden.calculatedSize).toBe(0);

    act(() => {
      const looker = new Looker();
      cache.set("one", looker);
    });

    expect(cache.hidden.size).toBe(0);
    expect(cache.pending.size).toBe(0);
    expect(cache.shown.size).toBe(1);
    expect(cache.hidden.calculatedSize).toBe(0);

    cache.hide("one");

    expect(cache.hidden.size).toBe(0);
    expect(cache.pending.size).toBe(1);
    expect(cache.shown.size).toBe(0);
    expect(cache.hidden.calculatedSize).toBe(0);

    const looker = cache.get("one");
    if (!looker) {
      throw new Error("looker is missing");
    }

    looker.dispatchEvent(new Event("load"));

    expect(cache.hidden.size).toBe(1);
    expect(cache.pending.size).toBe(0);
    expect(cache.shown.size).toBe(0);
    expect(cache.hidden.calculatedSize).toBe(1);
  });
});
