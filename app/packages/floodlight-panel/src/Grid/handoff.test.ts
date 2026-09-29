import { describe, expect, test } from "vitest";
import type { Scoped } from "../host/ownership";
import { handOff } from "./handoff";

const scope = (log: string[], name: string) =>
  ({
    flush: () => log.push(`flush ${name}`),
    retire: () => log.push(`retire ${name}`),
  }) as unknown as Scoped<number, unknown>;

describe("handOff", () => {
  test("retires the previous instance before moving items to the next", () => {
    const log: string[] = [];
    const cache = {
      evict: (key: string) => log.push(`evict ${key}`),
      freeze: () => log.push("freeze"),
      isShown: () => false,
      unfreeze: () => log.push("unfreeze"),
    };
    handOff({ cache, next: scope(log, "next"), previous: scope(log, "old") });

    expect(log).toEqual(["retire old", "freeze", "flush next", "unfreeze"]);
  });

  test("a first swap leaves the items its instance shows shown", () => {
    const log: string[] = [];
    const cache = {
      evict: (key: string) => log.push(`evict ${key}`),
      freeze: () => log.push("freeze"),
      isShown: () => false,
      unfreeze: () => log.push("unfreeze"),
    };
    handOff({ cache, next: scope(log, "next") });

    expect(log).toEqual(["flush next"]);
  });

  test("evicts removed items after the move, unless the next instance took them", () => {
    const log: string[] = [];
    const cache = {
      evict: (key: string) => log.push(`evict ${key}`),
      freeze: () => log.push("freeze"),
      isShown: (key: string) => key === "kept",
      unfreeze: () => log.push("unfreeze"),
    };
    handOff({
      cache,
      evict: ["gone", "kept"],
      next: scope(log, "next"),
      previous: scope(log, "old"),
    });

    expect(log).toEqual([
      "retire old",
      "freeze",
      "flush next",
      "unfreeze",
      "evict gone",
    ]);
  });
});
