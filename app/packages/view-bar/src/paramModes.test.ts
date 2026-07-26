/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { paramModes } from "./ViewBar";

type Source = "FIELDS" | "GROUP_SLICES" | "CONSTANTS" | "FREE_TEXT";
type Existence = "EXISTING" | "EXISTING_ROOT" | "ANY";

/**
 * A param as the server describes it. `tokens` is what the server splits `type`
 * into, so the two are kept consistent here rather than derived.
 */
const param = (
  type: string,
  source: Source = "FREE_TEXT",
  existence: Existence = "EXISTING",
) => ({
  name: "p",
  type,
  tokens: type.split("|"),
  nullable: type.split("|").includes("NoneType"),
  required: false,
  choices: {
    source,
    fields:
      source === "FIELDS"
        ? [{ level: "ANY" as const, existence, ftypes: [], labelTypes: [] }]
        : [],
    values: [],
  },
  default: null,
  placeholder: null,
});

describe("paramModes", () => {
  it("offers one control for a field that must already exist", () => {
    // `str` is only there because Python takes a field path as a plain string
    expect(paramModes(param("field|str", "FIELDS"))).toEqual(["field"]);
  });

  it("keeps the expression alternative beside a field", () => {
    expect(paramModes(param("field|str|json", "FIELDS"))).toEqual([
      "field",
      "json",
    ]);
  });

  it("offers text beside the picker when the stage writes the field", () => {
    expect(paramModes(param("NoneType|field|str", "FIELDS", "ANY"))).toEqual([
      "field",
      "string",
    ]);
    expect(paramModes(param("field|str", "FIELDS", "EXISTING_ROOT"))).toEqual([
      "field",
      "string",
    ]);
  });

  it("lets a field list subsume its singular", () => {
    expect(
      paramModes(param("NoneType|list<field>|field|list<str>|str", "FIELDS")),
    ).toEqual(["fieldList"]);
  });

  it("lets a list subsume its singular for strings and ids", () => {
    expect(paramModes(param("list<str>|str"))).toEqual(["stringList"]);
    expect(paramModes(param("list<id>|id"))).toEqual(["idList"]);
  });

  it("offers one control for a fixed set of values", () => {
    expect(paramModes(param("NoneType|list<str>|str", "CONSTANTS"))).toEqual([
      "stringList",
    ]);
  });

  it("keeps alternatives that mean different things", () => {
    expect(paramModes(param("NoneType|float|int|str"))).toEqual([
      "numeric",
      "string",
    ]);
  });

  it("falls back to an expression for a type it does not recognize", () => {
    expect(paramModes(param("json"))).toEqual(["json"]);
    expect(paramModes(param("something_new"))).toEqual(["json"]);
  });
});
