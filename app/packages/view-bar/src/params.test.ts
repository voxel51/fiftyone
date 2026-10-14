/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { gateDefinitions, paramModes } from "./params";

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

  it("keeps the expression alternatives beside a field", () => {
    // Both editors for the expression: the Python source and the json it
    // lowers to
    expect(paramModes(param("field|str|expr", "FIELDS"))).toEqual([
      "field",
      "python",
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
      "select",
    ]);
  });

  it("keeps alternatives that mean different things", () => {
    expect(paramModes(param("NoneType|float|int|str"))).toEqual([
      "numeric",
      "string",
    ]);
  });

  it("offers both editors for an expression", () => {
    expect(paramModes(param("expr"))).toEqual(["python", "json"]);
  });

  it("offers the raw editor alone for plain data", () => {
    // `MapLabels.map` is a lookup table and `Mongo.pipeline` a pipeline —
    // an expression is not an answer to either
    expect(paramModes(param("dict"))).toEqual(["json"]);
    expect(paramModes(param("json"))).toEqual(["json"]);
  });

  it("falls back to the raw editor for a type it does not recognize", () => {
    expect(paramModes(param("something_new"))).toEqual(["json"]);
  });
});

describe("gateDefinitions", () => {
  const defs = [
    {
      name: "SortBy",
      mediaTypes: [],
      params: [
        param("str", "FREE_TEXT"),
        { ...param("bool", "FREE_TEXT"), name: "create_index" },
        {
          ...param("field|str", "FIELDS"),
          name: "dist_field",
          choices: {
            source: "FIELDS" as const,
            values: [],
            fields: [
              {
                level: "ANY" as const,
                existence: "ANY" as const,
                ftypes: [],
                labelTypes: [],
              },
            ],
          },
        },
      ],
    },
  ];

  it("changes nothing when everything is allowed", () => {
    expect(
      gateDefinitions(defs, { createIndexes: true, createFields: true }),
    ).toEqual(defs);
  });

  it("hides create_index rather than dropping it", () => {
    const [gated] = gateDefinitions(defs, {
      createIndexes: false,
      createFields: true,
    });
    const createIndex = gated.params.find((p) => p.name === "create_index");
    expect(createIndex?.hidden).toBe(true);
    expect(gated.params).toHaveLength(defs[0].params.length);
  });

  it("tightens created-field constraints to existing fields", () => {
    const [gated] = gateDefinitions(defs, {
      createIndexes: true,
      createFields: false,
    });
    const distField = gated.params.find((p) => p.name === "dist_field");
    expect(
      distField?.choices.fields.every((c) => c.existence === "EXISTING"),
    ).toBe(true);
  });
});
