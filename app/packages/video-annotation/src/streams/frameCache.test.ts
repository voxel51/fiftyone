/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";
import { FrameCache } from "./frameCache";

const makeCache = (budgetBytes: number) =>
  new FrameCache({ frameCount: 100, budgetBytes });

describe("FrameCache", () => {
  it("evicts whole frames, farthest from the playhead first", () => {
    const cache = makeCache(300);
    const labels = { evict: vi.fn() };
    const bitmap = { evict: vi.fn() };
    cache.register("labels", labels);
    cache.register("bitmap", bitmap);
    cache.setPlayhead(10);

    for (const frame of [10, 11, 40]) {
      cache.set("labels", frame, 50);
      cache.set("bitmap", frame, 50);
    }

    // 300 bytes held; one more frame forces out the farthest one
    cache.set("labels", 12, 50);
    cache.set("bitmap", 12, 50);

    expect(labels.evict.mock.calls).toEqual([[40]]);
    expect(bitmap.evict.mock.calls).toEqual([[40]]);
    expect(cache.has(40)).toBe(false);
    expect(cache.stats().bytes).toBe(300);
  });

  it("ranks frames behind the playhead below frames as far ahead", () => {
    const cache = makeCache(150);
    const part = { evict: vi.fn() };
    cache.register("labels", part);
    cache.setPlayhead(50);

    cache.set("labels", 50, 50);
    cache.set("labels", 45, 50);
    cache.set("labels", 55, 50);
    cache.set("labels", 51, 50);

    expect(part.evict.mock.calls).toEqual([[45]]);
  });

  it("never evicts the playhead frame or a held frame", async () => {
    const cache = makeCache(100);
    const part = { evict: vi.fn() };
    cache.register("labels", part);
    cache.registerLoader(async () => {});
    cache.setPlayhead(1);

    const release = await cache.hold([90]);
    cache.set("labels", 1, 100);
    cache.set("labels", 90, 100);
    cache.set("labels", 2, 100);

    expect(part.evict.mock.calls).toEqual([[2]]);
    expect(cache.has(90)).toBe(true);

    release();

    expect(part.evict.mock.calls).toEqual([[2], [90]]);
  });

  it("lets held frames give up decoded parts, oldest first, keeping labels", async () => {
    const cache = makeCache(250);
    const labels = { evict: vi.fn() };
    const bitmap = { evict: vi.fn(), shed: vi.fn() };
    cache.register("labels", labels);
    cache.register("bitmap", bitmap);
    cache.registerLoader(async () => {});
    cache.setPlayhead(1);

    // an operation holds 10-12 and decodes each in turn, as SAM2 does
    const release = await cache.hold([10, 11, 12]);
    for (const frame of [10, 11, 12]) {
      cache.set("labels", frame, 10);
      cache.set("bitmap", frame, 100);
    }

    expect(labels.evict).not.toHaveBeenCalled();
    expect(bitmap.evict).not.toHaveBeenCalled();
    expect(bitmap.shed.mock.calls).toEqual([[10]]);
    expect(cache.has(10)).toBe(true);

    release();
  });

  it("loads held frames through every loader", async () => {
    const cache = makeCache(1e9);
    const loader = vi.fn(async () => {});
    cache.registerLoader(loader);

    const release = await cache.hold([3, 1, 3, 500]);

    expect(loader).toHaveBeenCalledWith([3, 1]);
    release();
  });

  it("sizes lookahead from the cost of a full frame", () => {
    const cache = makeCache(1000);
    cache.register("labels", { evict: () => {} });
    cache.register("bitmap", { evict: () => {} });

    expect(cache.aheadFrames()).toBe(Number.POSITIVE_INFINITY);

    cache.set("labels", 1, 10);
    cache.set("bitmap", 1, 90);

    // half the budget at 100 bytes a frame
    expect(cache.aheadFrames()).toBe(5);
  });

  it("forgets a part's frames when it unregisters", () => {
    const cache = makeCache(1000);
    const unregister = cache.register("bitmap", { evict: () => {} });
    cache.set("bitmap", 1, 400);

    unregister();

    expect(cache.has(1)).toBe(false);
    expect(cache.stats().bytes).toBe(0);
  });
});
