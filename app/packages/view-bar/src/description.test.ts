import { describe, expect, it } from "vitest";

import { tokenize } from "./description";

describe("tokenize", () => {
  it("passes plain prose through as one token", () => {
    expect(tokenize("Creates a view with at most N samples.")).toEqual([
      { kind: "text", text: "Creates a view with at most N samples." },
    ]);
  });

  it("renders a class role as its bare name", () => {
    expect(
      tokenize(
        "Filters the :class:`fiftyone.core.labels.Label` field of each sample.",
      ),
    ).toEqual([
      { kind: "text", text: "Filters the " },
      {
        kind: "ref",
        text: "Label",
      },
      { kind: "text", text: " field of each sample." },
    ]);
  });

  it("strips the ~ shorthand", () => {
    expect(tokenize(":class:`~fiftyone.core.stages.Limit`")).toEqual([
      {
        kind: "ref",
        text: "Limit",
      },
    ]);
  });

  it("renders a method role as its bare name", () => {
    expect(
      tokenize(":meth:`fiftyone.core.collections.SampleCollection.exists`"),
    ).toEqual([
      {
        kind: "ref",
        text: "exists",
      },
    ]);
  });

  it("renders a module role as its last segment", () => {
    expect(tokenize(":mod:`fiftyone.core.stages`")).toEqual([
      {
        kind: "ref",
        text: "stages",
      },
    ]);
  });

  it("renders double-backtick literals as code", () => {
    expect(tokenize("a non-``None`` value")).toEqual([
      { kind: "text", text: "a non-" },
      { kind: "code", text: "None" },
      { kind: "text", text: " value" },
    ]);
  });

  it("handles roles and literals in one sentence", () => {
    expect(
      tokenize("Sets :class:`~fiftyone.core.labels.Label` to ``None``."),
    ).toEqual([
      { kind: "text", text: "Sets " },
      {
        kind: "ref",
        text: "Label",
      },
      { kind: "text", text: " to " },
      { kind: "code", text: "None" },
      { kind: "text", text: "." },
    ]);
  });

  it("keeps a dotless path whole", () => {
    expect(tokenize(":class:`Label`")).toEqual([
      {
        kind: "ref",
        text: "Label",
      },
    ]);
  });
});
