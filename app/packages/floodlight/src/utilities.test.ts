/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, test, vi } from "vitest";

import type Row from "./row";
import type Section from "./section";
import type { ID } from "./types";
import { findTop, handleRowChange, scrollToPosition } from "./utilities";

type Stub = { first?: ID; from: number; primaryExtent: number };

const row = (stub: Stub) => stub as unknown as Row<number, object>;

const section = (primaryExtent: number, rows: Record<string, Stub> = {}) =>
  ({
    find: (description: string) =>
      rows[description] ? row(rows[description]) : null,
    primaryExtent,
  }) as unknown as Section<number, object>;

// backward rows are laid out from the section's end: row "b" spans 200-300
const backward = section(400, { b: { from: 100, primaryExtent: 100 } });
const forward = section(1000, { f: { from: 50, primaryExtent: 200 } });

const top = (at: Parameters<typeof findTop>[0]["at"]) =>
  findTop({ at, backward, forward, offset: false, scrollTop: 7 });

describe("findTop", () => {
  test("resolves a forward anchor by its fraction of the row", () => {
    expect(top({ description: "f", fraction: 0.05 })).toBe(440);
    expect(top({ description: "f", fraction: 0.25 })).toBe(400);
  });

  test("resolves a backward anchor by its fraction of the row", () => {
    expect(top({ description: "b", fraction: 0.1 })).toBe(190);
    expect(top({ description: "b", fraction: 0.5 })).toBe(150);
  });

  test("treats a missing fraction as the row's start", () => {
    expect(top({ description: "f" })).toBe(450);
  });

  test("falls back to scrollTop when the anchor is not loaded", () => {
    expect(top({ description: "missing", fraction: 0.5 })).toBe(7);
    expect(top(undefined)).toBe(7);
  });
});

describe("scrollToPosition", () => {
  test("honors the fraction of a backward anchor", () => {
    const el = { scrollTo: vi.fn() } as unknown as HTMLDivElement;
    scrollToPosition({
      at: { description: "b", fraction: 0.1 },
      backward,
      el,
      forward,
      offset: false,
      top: 0,
    });
    expect(el.scrollTo).toHaveBeenCalledWith(0, 190);
  });
});

describe("handleRowChange", () => {
  test("reports the viewport's position as a fraction of the row", () => {
    const id = { description: "f" };
    const keys = new WeakMap<ID, number>([[id, 3]]);
    const change = handleRowChange({
      at: undefined,
      dispatchOffset: true,
      keys,
      matches: {
        forward: {
          delta: 50,
          row: row({ first: id, from: 0, primaryExtent: 200 }),
        },
      },
    });
    expect(change?.fraction).toBe(0.25);
    expect(change?.page).toBe(3);
  });
});
