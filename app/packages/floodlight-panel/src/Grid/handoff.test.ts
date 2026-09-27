import { describe, expect, test } from "vitest";
import type { Scoped } from "../host/ownership";
import { handOff } from "./handoff";

const scope = (log: string[], name: string) =>
  ({
    flush: () => log.push(`flush ${name}`),
    retire: () => log.push(`retire ${name}`),
  }) as unknown as Scoped<number, unknown>;

describe("handOff", () => {
  test("retires the previous instance before moving lookers to the next", () => {
    const log: string[] = [];
    const cache = {
      freeze: () => log.push("freeze"),
      unfreeze: () => log.push("unfreeze"),
    };
    handOff({ cache, next: scope(log, "next"), previous: scope(log, "old") });

    expect(log).toEqual(["retire old", "freeze", "flush next", "unfreeze"]);
  });

  test("a first swap has no previous instance", () => {
    const log: string[] = [];
    const cache = {
      freeze: () => log.push("freeze"),
      unfreeze: () => log.push("unfreeze"),
    };
    handOff({ cache, next: scope(log, "next") });

    expect(log).toEqual(["freeze", "flush next", "unfreeze"]);
  });
});
