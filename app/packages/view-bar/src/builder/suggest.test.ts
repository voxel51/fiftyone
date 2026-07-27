/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import type { Kind } from "./catalog";
import {
  caretContext,
  completeField,
  kindOf,
  signatureAt,
  suggestFields,
  suggestOperators,
} from "./suggest";

const KINDS: Record<string, Kind> = {
  confidence: "NUMBER",
  label: "STRING",
  detections: "ARRAY",
  created_at: "DATE",
};

const fieldKind = (path: string) => KINDS[path];

describe("caretContext", () => {
  it("reads the receiver from what precedes a dot", () => {
    const source = 'F("confidence").';
    const context = caretContext(source, source.length);
    expect(context.receiver).toEqual({ t: "field", path: "confidence" });
    expect(context.prefix).toBe("");
  });

  it("carries what has been typed after the dot", () => {
    const source = 'F("label").low';
    const context = caretContext(source, source.length);
    expect(context.receiver).toEqual({ t: "field", path: "label" });
    expect(context.prefix).toBe("low");
  });

  it("has no receiver away from a member position", () => {
    const source = 'F("confidence") > ';
    expect(caretContext(source, source.length).receiver).toBeUndefined();
  });

  it("finds the call the caret is inside, and which argument", () => {
    const source = 'F("label").contains("a", ';
    const context = caretContext(source, source.length);
    expect(context.openCall).toMatchObject({ op: "contains", argIndex: 1 });
  });

  it("does not count commas from a nested bracket", () => {
    const source = 'F("x").is_in([1, 2, 3], ';
    expect(caretContext(source, source.length).openCall).toMatchObject({
      op: "is_in",
      argIndex: 1,
    });
  });

  it("ignores brackets and commas inside a string", () => {
    const source = 'F("label").contains("a, (b", ';
    expect(caretContext(source, source.length).openCall).toMatchObject({
      op: "contains",
      argIndex: 1,
    });
  });

  it("survives a receiver that does not parse", () => {
    const source = 'F("label" > .';
    expect(() => caretContext(source, source.length)).not.toThrow();
    expect(caretContext(source, source.length).receiver).toBeUndefined();
  });
});

describe("kindOf", () => {
  it("resolves a field through the schema", () => {
    expect(kindOf({ t: "field", path: "confidence" }, CATALOG, fieldKind)).toBe(
      "NUMBER",
    );
  });

  it("treats an unknown path as ANY rather than an error", () => {
    expect(kindOf({ t: "field", path: "nope" }, CATALOG, fieldKind)).toBe(
      "ANY",
    );
  });

  it("takes a call's kind from what the operator returns", () => {
    expect(
      kindOf(
        {
          t: "call",
          op: "length",
          self: { t: "field", path: "detections" },
          args: [],
          kwargs: {},
        },
        CATALOG,
        fieldKind,
      ),
    ).toBe("NUMBER");
  });

  it("reads literals", () => {
    expect(kindOf({ t: "lit", v: 1 }, CATALOG, fieldKind)).toBe("NUMBER");
    expect(kindOf({ t: "lit", v: "a" }, CATALOG, fieldKind)).toBe("STRING");
    expect(kindOf({ t: "lit", v: 0, as: "date" }, CATALOG, fieldKind)).toBe(
      "DATE",
    );
  });
});

describe("suggestOperators", () => {
  it("puts the matching kind first and keeps mismatches with a reason", () => {
    const suggestions = suggestOperators("NUMBER", "", CATALOG);

    const applicable = suggestions.filter((s) => s.applicable);
    const rejected = suggestions.filter((s) => !s.applicable);

    expect(applicable[0].operator.selfKind).toBe("NUMBER");
    expect(applicable.every((s) => !s.reason)).toBe(true);

    const contains = rejected.find((s) => s.operator.name === "contains");
    expect(contains?.reason).toBe("contains needs STRING, this is NUMBER");
  });

  it("never rejects an operator that applies to anything", () => {
    const exists = suggestOperators("ARRAY", "", CATALOG).find(
      (s) => s.operator.name === "exists",
    );
    expect(exists?.applicable).toBe(true);
  });

  it("offers everything for an unknown kind", () => {
    expect(
      suggestOperators("ANY", "", CATALOG).every((s) => s.applicable),
    ).toBe(true);
  });

  it("filters by what has been typed, prefix matches first", () => {
    const suggestions = suggestOperators("STRING", "co", CATALOG);
    expect(suggestions[0].operator.name).toBe("contains");
    expect(suggestions.every((s) => s.operator.display.includes("co"))).toBe(
      true,
    );
  });
});

describe("signatureAt", () => {
  it("reports the active argument and the kind it wants", () => {
    const source = 'F("detections").filter(';
    const signature = signatureAt(caretContext(source, source.length), CATALOG);
    expect(signature?.operator.name).toBe("filter");
    expect(signature?.argIndex).toBe(0);
    expect(signature?.argKind).toBe("BOOLEAN");
  });

  it("falls back to ANY past the operator's arity", () => {
    const source = 'F("label").lower(, , ';
    const signature = signatureAt(caretContext(source, source.length), CATALOG);
    expect(signature?.argKind).toBe("ANY");
  });

  it("is absent outside an argument list", () => {
    const source = 'F("confidence") > 0.5';
    expect(
      signatureAt(caretContext(source, source.length), CATALOG),
    ).toBeUndefined();
  });
});

describe("field completion", () => {
  const PATHS = ["label", "labels", "id", "ground_truth.detections.label"];

  it("completes a field name being typed inside F(", () => {
    const source = 'F("l';
    const context = caretContext(source, source.length);
    expect(context.field).toEqual({ typed: "l", start: 3 });
    expect(suggestFields(context.field!.typed, PATHS)[0]).toBe("label");
  });

  it("offers every path before anything is typed", () => {
    const source = 'F("';
    const context = caretContext(source, source.length);
    expect(context.field?.typed).toBe("");
    expect(suggestFields("", PATHS)).toHaveLength(PATHS.length);
  });

  it("prefers a prefix match, then the shorter path", () => {
    expect(suggestFields("label", PATHS)).toEqual([
      "label",
      "labels",
      "ground_truth.detections.label",
    ]);
  });

  it("does not complete fields into some other string", () => {
    const source = 'F("label").contains("l';
    expect(caretContext(source, source.length).field).toBeUndefined();
  });

  it("does not treat a closed string as an open one", () => {
    const source = 'F("label")';
    expect(caretContext(source, source.length).field).toBeUndefined();
  });
});

describe("unquoted field completion", () => {
  const PATHS = ["label", "labels", "confidence"];

  it("completes a bare path inside F(", () => {
    const source = "F(l";
    const context = caretContext(source, source.length);
    expect(context.field).toEqual({ typed: "l", start: 2 });
    expect(suggestFields(context.field!.typed, PATHS)[0]).toBe("label");
  });

  it("offers everything the moment F( opens", () => {
    const source = "F(";
    expect(caretContext(source, source.length).field?.typed).toBe("");
  });

  it("completes a bare dotted path", () => {
    const source = "F(ground_truth.la";
    expect(caretContext(source, source.length).field?.typed).toBe(
      "ground_truth.la",
    );
  });

  it("stops offering fields once the path is not a path", () => {
    const source = "F(a + ";
    expect(caretContext(source, source.length).field).toBeUndefined();
  });

  it("does not treat another call's argument as a field", () => {
    const source = "F(conf).is_in(1";
    expect(caretContext(source, source.length).field).toBeUndefined();
  });
});

describe("completeField", () => {
  it("closes the quote and the call, quoted", () => {
    const source = 'F("l';
    const done = completeField(source, { typed: "l", start: 3 }, "label");
    expect(done.source).toBe('F("label")');
    expect(done.offset).toBe(done.source.length);
  });

  it("closes the call, unquoted", () => {
    const done = completeField("F(l", { typed: "l", start: 2 }, "label");
    expect(done.source).toBe("F(label)");
    expect(done.offset).toBe(done.source.length);
  });

  it("does not double closers that are already there", () => {
    const source = 'F("l") > 3';
    const done = completeField(source, { typed: "l", start: 3 }, "label");
    expect(done.source).toBe('F("label") > 3');
    expect(done.offset).toBe('F("label")'.length);
  });

  it("keeps what follows an unquoted completion", () => {
    const source = "F(l) > 3";
    const done = completeField(source, { typed: "l", start: 2 }, "label");
    expect(done.source).toBe("F(label) > 3");
    expect(done.offset).toBe("F(label)".length);
  });

  it("replaces a deeper typed path", () => {
    const source = 'F("ground_truth.la';
    const done = completeField(
      source,
      { typed: "ground_truth.la", start: 3 },
      "ground_truth.label",
    );
    expect(done.source).toBe('F("ground_truth.label")');
  });
});

describe("operators after a complete atom", () => {
  it("offers operators right after a closed call", () => {
    const source = "F(label)";
    const context = caretContext(source, source.length);
    expect(context.receiver).toEqual({ t: "field", path: "label" });
  });

  it("offers operators right after a quoted call", () => {
    const source = 'F("label")';
    expect(caretContext(source, source.length).receiver).toEqual({
      t: "field",
      path: "label",
    });
  });

  it("does not parse mid-identifier", () => {
    const source = "F(label).lo";
    const context = caretContext(source, source.length);
    expect(context.prefix).toBe("lo");
  });
});
