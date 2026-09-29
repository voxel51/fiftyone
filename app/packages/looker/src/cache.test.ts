import { describe, expect, it, vi } from "vitest";
import { createCache } from "./cache";

class Looker extends EventTarget {
  destroy = () => undefined;
  size = 1;
  getSizeBytesEstimate = () => this.size;
  loaded: boolean;
}

describe("useLookerCache", () => {
  it("keeps a ten-thousand-item scroll sweep within the hidden bounds", () => {
    const maxHiddenItems = 200;
    const onDispose = vi.fn();
    const cache = createCache<Looker>({
      maxHiddenItems,
      maxHiddenItemsSizeBytes: maxHiddenItems,
      onDispose,
    });

    for (let index = 0; index < 10_000; index++) {
      const looker = new Looker();
      looker.loaded = true;
      const key = String(index);
      cache.set(key, looker);
      cache.hide(key);
    }

    expect(cache.hidden.size).toBe(maxHiddenItems);
    expect(cache.hidden.calculatedSize).toBe(maxHiddenItems);
    expect(cache.shown.size).toBe(0);
    expect(cache.pending.size).toBe(0);
    expect(onDispose).toHaveBeenCalledTimes(10_000 - maxHiddenItems);

    cache.delete();
  });

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

    looker.size = 2;
    cache.updateSize("one");
    expect(cache.hidden.calculatedSize).toBe(2);

    cache.freeze();
    expect(cache.isShown("one")).toBe(false);
    expect(cache.frozen.size).toBe(0);
    expect(cache.hidden.size).toBe(1);
    expect(cache.hidden.calculatedSize).toBe(2);
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
    expect(cache.hidden.calculatedSize).toBe(2);
    expect(cache.pending.size).toBe(0);
    expect(cache.shown.size).toBe(0);

    cache.delete();
    expect(onDispose).toHaveBeenCalledOnce();
  });
});

describe("evict", () => {
  const setup = () => {
    const onDispose = vi.fn();
    const cache = createCache<Looker>({
      maxHiddenItems: 10,
      maxHiddenItemsSizeBytes: 10,
      onDispose,
    });
    const looker = new Looker();
    looker.destroy = vi.fn();
    return { cache, looker, onDispose };
  };

  type Cache = ReturnType<typeof createCache<Looker>>;
  it.each([
    ["shown", () => undefined],
    ["frozen", (cache: Cache) => cache.freeze()],
    ["hidden", (cache: Cache) => cache.hide("a")],
  ])("destroys a %s instance exactly once", (_, move) => {
    const { cache, looker, onDispose } = setup();
    looker.loaded = true;
    cache.set("a", looker);
    move(cache);

    cache.evict("a");

    expect(cache.get("a")).toBeUndefined();
    expect(looker.destroy).toHaveBeenCalledTimes(1);
    expect(onDispose).toHaveBeenCalledTimes(1);
    expect(onDispose).toHaveBeenCalledWith("a");
  });

  it("destroys a pending instance exactly once", () => {
    const { cache, looker, onDispose } = setup();
    looker.loaded = false;
    cache.set("a", looker);
    cache.hide("a");
    expect(cache.pending.has("a")).toBe(true);

    cache.evict("a");

    expect(cache.get("a")).toBeUndefined();
    expect(looker.destroy).toHaveBeenCalledTimes(1);
    expect(onDispose).toHaveBeenCalledTimes(1);
  });

  it("ignores a key it does not hold", () => {
    const { cache, onDispose } = setup();

    cache.evict("missing");

    expect(onDispose).toHaveBeenCalledTimes(0);
  });
});
