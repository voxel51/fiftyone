import { describe, expect, it, vi } from "vitest";
import { createCache } from "./cache";

class Looker extends EventTarget {
  destroy = () => undefined;
  getSizeBytesEstimate = () => 1;
  loaded: boolean;
}

describe("useLookerCache", () => {
  it("assert loaded, pending, and shown cache states and transitions", () => {
    const onDispose = vi.fn();
    const onSet = vi.fn();
    const cache = createCache<Looker>({
      maxHiddenItems: 2,
      maxHiddenItemsSizeBytes: 2,
      onDispose,
      onSet,
    });
    expect(cache.frozen.size).toBe(0);
    expect(cache.hidden.size).toBe(0);
    expect(cache.hidden.calculatedSize).toBe(0);
    expect(cache.pending.size).toBe(0);
    expect(cache.shown.size).toBe(0);

    cache.set("one", new Looker());
    expect(onSet).toHaveBeenCalledOnce();
    expect(cache.isShown("one")).toBe(true);
    expect(cache.frozen.size).toBe(0);
    expect(cache.hidden.size).toBe(0);
    expect(cache.hidden.calculatedSize).toBe(0);
    expect(cache.pending.size).toBe(0);
    expect(cache.shown.size).toBe(1);

    cache.hide("one");
    expect(cache.isShown("one")).toBe(false);
    expect(cache.frozen.size).toBe(0);
    expect(cache.hidden.size).toBe(0);
    expect(cache.hidden.calculatedSize).toBe(0);
    expect(cache.pending.size).toBe(1);
    expect(cache.shown.size).toBe(0);

    const looker = cache.get("one");
    looker.loaded = true;
    looker.dispatchEvent(new Event("load"));
    expect(cache.isShown("one")).toBe(false);
    expect(cache.frozen.size).toBe(0);
    expect(cache.hidden.size).toBe(1);
    expect(cache.hidden.calculatedSize).toBe(1);
    expect(cache.pending.size).toBe(0);
    expect(cache.shown.size).toBe(0);

    cache.freeze();
    expect(cache.isShown("one")).toBe(false);
    expect(cache.frozen.size).toBe(0);
    expect(cache.hidden.size).toBe(1);
    expect(cache.hidden.calculatedSize).toBe(1);
    expect(cache.pending.size).toBe(0);
    expect(cache.shown.size).toBe(0);

    cache.show("one");
    expect(cache.isShown("one")).toBe(true);
    cache.freeze();
    expect(cache.isShown("one")).toBe(false);
    expect(cache.frozen.size).toBe(1);
    expect(cache.hidden.size).toBe(0);
    expect(cache.hidden.calculatedSize).toBe(0);
    expect(cache.pending.size).toBe(0);
    expect(cache.shown.size).toBe(0);

    cache.set("one", looker);
    expect(onSet).toHaveBeenCalledTimes(2);
    expect(cache.isShown("one")).toBe(true);
    expect(cache.frozen.size).toBe(0);
    expect(cache.hidden.size).toBe(0);
    expect(cache.hidden.calculatedSize).toBe(0);
    expect(cache.pending.size).toBe(0);
    expect(cache.shown.size).toBe(1);

    cache.freeze();
    cache.unfreeze();
    expect(cache.isShown("one")).toBe(false);
    expect(cache.frozen.size).toBe(0);
    expect(cache.hidden.size).toBe(1);
    expect(cache.hidden.calculatedSize).toBe(1);
    expect(cache.pending.size).toBe(0);
    expect(cache.shown.size).toBe(0);

    cache.delete();
    expect(onDispose).toHaveBeenCalledOnce();
  });
});
