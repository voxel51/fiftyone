import { describe, expect, it } from "vitest";

import { tokenize } from "./description";

describe("tokenize", () => {
  it("passes plain prose through as one token", () => {
    expect(tokenize("Creates a view with at most N samples.")).toEqual([
      { kind: "text", text: "Creates a view with at most N samples." },
    ]);
  });

  it("renders a class role as its bare name linking to the module page", () => {
    expect(
      tokenize(
        "Filters the :class:`fiftyone.core.labels.Label` field of each sample.",
      ),
    ).toEqual([
      { kind: "text", text: "Filters the " },
      {
        kind: "ref",
        text: "Label",
        href: "https://docs.voxel51.com/api/fiftyone.core.labels.html#fiftyone.core.labels.Label",
      },
      { kind: "text", text: " field of each sample." },
    ]);
  });

  it("strips the ~ shorthand", () => {
    expect(tokenize(":class:`~fiftyone.core.stages.Limit`")).toEqual([
      {
        kind: "ref",
        text: "Limit",
        href: "https://docs.voxel51.com/api/fiftyone.core.stages.html#fiftyone.core.stages.Limit",
      },
    ]);
  });

  it("anchors a method role to its full dotted path", () => {
    expect(
      tokenize(":meth:`fiftyone.core.collections.SampleCollection.exists`"),
    ).toEqual([
      {
        kind: "ref",
        text: "exists",
        href: "https://docs.voxel51.com/api/fiftyone.core.collections.html#fiftyone.core.collections.SampleCollection.exists",
      },
    ]);
  });

  it("links a module role to its own page", () => {
    expect(tokenize(":mod:`fiftyone.core.stages`")).toEqual([
      {
        kind: "ref",
        text: "stages",
        href: "https://docs.voxel51.com/api/fiftyone.core.stages.html",
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
        href: "https://docs.voxel51.com/api/fiftyone.core.labels.html#fiftyone.core.labels.Label",
      },
      { kind: "text", text: " to " },
      { kind: "code", text: "None" },
      { kind: "text", text: "." },
    ]);
  });

  it("falls back to a bare page for a dotless path", () => {
    expect(tokenize(":class:`Label`")).toEqual([
      {
        kind: "ref",
        text: "Label",
        href: "https://docs.voxel51.com/api/Label.html",
      },
    ]);
  });
});
