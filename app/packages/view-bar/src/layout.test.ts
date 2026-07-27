/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The layout rules, as rules rather than as rendered output.
 *
 * These are the decisions that kept regressing while the popover was being
 * shaped: where the editor switcher goes, what order parameters appear in, and
 * which of them the user is meant to see at all. Each one is a pure function so
 * it can be pinned here rather than re-litigated by eye.
 */

import { describe, expect, it } from "vitest";
import {
  appliesTo,
  defaultKwargs,
  PLACES_ITS_OWN_TABS,
  NO_STATUS_LINE,
  isPrivate,
  rows,
} from "./params";
import type { InputKind } from "./params";

const param = (name: string, type = "str") => ({
  name,
  type,
  tokens: type.split("|"),
  nullable: type.split("|").includes("NoneType"),
  required: false,
  choices: { source: "FREE_TEXT" as const, fields: [], values: [] },
  default: null,
  placeholder: null,
});

/** The stage that drove most of this: a field, an expression, two toggles. */
const FILTER_LABELS = [
  param("field", "field|str"),
  param("filter", "json"),
  param("only_matches", "bool"),
  param("trajectories", "bool"),
];

const kindOf = (p: { name: string; tokens: readonly string[] }): InputKind => {
  if (p.tokens.includes("bool")) return "bool";
  if (p.tokens.includes("json")) return "python";
  if (p.tokens.includes("field")) return "field";
  return "string";
};

describe("rows", () => {
  it("puts every toggle last, in one row", () => {
    expect(
      rows(FILTER_LABELS, kindOf).map((r) => r.map((p) => p.name)),
    ).toEqual([["field"], ["filter"], ["only_matches", "trajectories"]]);
  });

  it("moves toggles to the end even when declared first", () => {
    const params = [param("flat", "bool"), param("field", "field|str")];
    expect(rows(params, kindOf).map((r) => r.map((p) => p.name))).toEqual([
      ["field"],
      ["flat"],
    ]);
  });

  it("gives everything else its own full-width row", () => {
    const params = [param("a", "int"), param("b", "str")];
    expect(rows(params, kindOf).map((r) => r.length)).toEqual([1, 1]);
  });

  it("adds no empty row when there are no toggles", () => {
    expect(rows([param("a", "int")], kindOf)).toHaveLength(1);
  });

  it("keeps a toggle-only stage to a single row", () => {
    const params = [param("x", "bool"), param("y", "bool")];
    expect(rows(params, kindOf)).toHaveLength(1);
  });
});

describe("isPrivate", () => {
  it("hides what the stage keeps for itself", () => {
    expect(isPrivate(param("_state", "NoneType|json"))).toBe(true);
    expect(isPrivate(param("_randint", "NoneType|int"))).toBe(true);
    expect(isPrivate(param("_allow_missing", "bool"))).toBe(true);
  });

  it("shows what the user owns", () => {
    expect(isPrivate(param("field", "field|str"))).toBe(false);
    expect(isPrivate(param("only_matches", "bool"))).toBe(false);
  });
});

describe("where the switcher goes", () => {
  it("is placed by the controls with a tall region", () => {
    // Their suggestion list and editor must span the popover, not start past
    // a column of tabs
    expect(PLACES_ITS_OWN_TABS.has("python")).toBe(true);
    expect(PLACES_ITS_OWN_TABS.has("json")).toBe(true);
  });

  it("sits beside every one-line control", () => {
    for (const kind of [
      "field",
      "fieldList",
      "string",
      "stringList",
      "numeric",
      "id",
      "idList",
      "bool",
    ] as InputKind[]) {
      expect(PLACES_ITS_OWN_TABS.has(kind)).toBe(false);
    }
  });
});

describe("the reserved status line", () => {
  it("is skipped where it would only be dead space", () => {
    // A toggle has no invalid state, and the expression editor says it itself
    expect(NO_STATUS_LINE.has("bool")).toBe(true);
    expect(NO_STATUS_LINE.has("python")).toBe(true);
  });

  it("is held open for every control that can be wrong", () => {
    for (const kind of [
      "field",
      "fieldList",
      "string",
      "stringList",
      "numeric",
      "id",
      "idList",
      "json",
    ] as InputKind[]) {
      expect(NO_STATUS_LINE.has(kind)).toBe(false);
    }
  });
});

describe("appliesTo", () => {
  const group = { mediaTypes: ["group"] };
  const video = { mediaTypes: ["video"] };
  const any = { mediaTypes: [] as string[] };

  it("offers the group stages only to group datasets", () => {
    expect(appliesTo(group, "group")).toBe(true);
    expect(appliesTo(group, "image")).toBe(false);
    expect(appliesTo(group, "video")).toBe(false);
  });

  it("offers the video stages only to video datasets", () => {
    expect(appliesTo(video, "video")).toBe(true);
    expect(appliesTo(video, "image")).toBe(false);
  });

  it("offers an undeclared stage to anything", () => {
    expect(appliesTo(any, "image")).toBe(true);
    expect(appliesTo(any, "group")).toBe(true);
    expect(appliesTo(any, null)).toBe(true);
  });

  it("offers nothing restricted before a dataset is known", () => {
    expect(appliesTo(group, null)).toBe(false);
  });
});

describe("defaultKwargs", () => {
  it("seeds a boolean default so the toggle shows what will happen", () => {
    const params = [
      { ...param("only_matches", "bool"), default: "True" },
      { ...param("trajectories", "bool"), default: "False" },
    ];
    expect(defaultKwargs(params)).toEqual({
      only_matches: true,
      trajectories: false,
    });
  });

  it("seeds nothing for a parameter that defaults to nothing", () => {
    const params = [
      { ...param("seed", "NoneType|float"), default: "None" },
      param("field", "field|str"),
    ];
    expect(defaultKwargs(params)).toEqual({});
  });
});
