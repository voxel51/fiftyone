/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { kindsByFtype, operatorsFrom } from "./catalog";

describe("operatorsFrom", () => {
  it("keeps served rows as-is when every kind is known", () => {
    const [gt] = operatorsFrom([
      {
        name: "__gt__",
        display: ">",
        selfKind: "ANY",
        argKinds: ["NUMBER"],
        returns: "BOOLEAN",
        minArgs: 1,
        maxArgs: 1,
        summary: "greater than",
      },
    ]);

    expect(gt).toEqual({
      name: "__gt__",
      display: ">",
      selfKind: "ANY",
      argKinds: ["NUMBER"],
      returns: "BOOLEAN",
      minArgs: 1,
      maxArgs: 1,
      summary: "greater than",
    });
  });

  it("reads a kind this build does not know as ANY", () => {
    const [op] = operatorsFrom([
      {
        name: "future",
        display: "future",
        selfKind: "GEOMETRY",
        argKinds: ["GEOMETRY", "NUMBER"],
        returns: "GEOMETRY",
        minArgs: 1,
        maxArgs: null,
        summary: "from a newer server",
      },
    ]);

    expect(op.selfKind).toBe("ANY");
    expect(op.argKinds).toEqual(["ANY", "NUMBER"]);
    expect(op.returns).toBe("ANY");
    expect(op.maxArgs).toBeNull();
  });
});

describe("kindsByFtype", () => {
  it("maps ftypes to kinds, unknown kinds to ANY", () => {
    const kinds = kindsByFtype([
      { ftype: "fiftyone.core.fields.FloatField", kind: "NUMBER" },
      { ftype: "fiftyone.core.fields.GeoField", kind: "GEOMETRY" },
    ]);

    expect(kinds.get("fiftyone.core.fields.FloatField")).toBe("NUMBER");
    expect(kinds.get("fiftyone.core.fields.GeoField")).toBe("ANY");
    expect(kinds.get("fiftyone.core.fields.StringField")).toBeUndefined();
  });
});
