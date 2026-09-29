/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { resolveURL } from "./utils";

describe("resolves datasets", () => {
  it("drops dataset-specific subset scope when changing datasets", () => {
    expect(
      resolveURL({
        currentPathname: "/datasets/one",
        currentSearch: "?subset=old&subsetScope=segments&other=keep",
        nextDataset: "two",
      }),
    ).toBe("/datasets/two?other=keep");
  });

  it("preserves subset scope for updates within the same dataset", () => {
    expect(
      resolveURL({
        currentPathname: "/datasets/one",
        currentSearch: "?subset=keep&subsetScope=segments",
        nextDataset: "one",
        nextView: "saved",
      }),
    ).toBe("/datasets/one?subset=keep&subsetScope=segments&view=saved");
  });
  it("resolves to /", () => {
    expect(
      resolveURL({
        currentPathname: "/datasets/my-dataset",
        currentSearch: "",
        nextDataset: null,
      }),
    ).toBe("/");
    expect(
      resolveURL({
        currentPathname: "/datasets/my-dataset",
        currentSearch: "",
      }),
    ).toBe("/datasets/my-dataset");
  });
});

describe("resolves wih proxy", () => {
  it("resolves to /", () => {
    expect(
      resolveURL({
        currentPathname: "/datasets/my-dataset",
        currentSearch: "?proxy=/my/proxy",
        nextDataset: null,
      }),
    ).toBe(`/my/proxy?proxy=${encodeURIComponent("/my/proxy")}`);
    expect(
      resolveURL({
        currentPathname: "/my/proxy/datasets/my-dataset",
        currentSearch: "?proxy=/my/proxy",
      }),
    ).toBe(
      `/my/proxy/datasets/my-dataset?proxy=${encodeURIComponent("/my/proxy")}`,
    );
  });
});

describe("resolves views", () => {
  it("throws error", () => {
    expect(() =>
      resolveURL({
        currentPathname: "",
        currentSearch: "",
        nextDataset: null,
        nextView: "view",
      }),
    ).toThrowError();
  });

  it("throws error", () => {
    expect(() =>
      resolveURL({
        currentPathname: "",
        currentSearch: "",
        nextView: "view",
      }),
    ).toThrowError();
  });

  it("resolves with saved view", () => {
    expect(
      resolveURL({
        currentPathname: "/datasets/my-dataset",
        currentSearch: "",
        nextDataset: "my-dataset",
        nextView: "view",
      }),
    ).toBe("/datasets/my-dataset?view=view");
  });
});

describe("resolves current", () => {
  it("does not change location", () => {
    expect(
      resolveURL({
        currentPathname: "/datasets/my-dataset",
        currentSearch: "?view=view",
      }),
    ).toBe("/datasets/my-dataset?view=view");
  });
});

describe("resolves the open sample", () => {
  it("keeps it for updates within the same dataset", () => {
    expect(
      resolveURL({
        currentPathname: "/datasets/d/samples/a",
        currentSearch: "?view=v",
        nextDataset: "d",
        nextView: "w",
      }),
    ).toBe("/datasets/d/samples/a?view=w");
    expect(
      resolveURL({
        currentPathname: "/datasets/d/groups/g",
        currentSearch: "",
        extra: { workspace: "w" },
      }),
    ).toBe("/datasets/d/groups/g?workspace=w");
  });

  it("drops it when changing datasets", () => {
    expect(
      resolveURL({
        currentPathname: "/datasets/d/samples/a",
        currentSearch: "",
        nextDataset: "other",
      }),
    ).toBe("/datasets/other");
  });

  it("writes a named sample as a path, a group's by its group", () => {
    expect(
      resolveURL({
        currentPathname: "/datasets/d",
        currentSearch: "",
        nextDataset: "d",
        extra: { groupId: "g", id: "a" },
      }),
    ).toBe("/datasets/d/groups/g");
    expect(
      resolveURL({
        currentPathname: "/datasets/d/groups/g",
        currentSearch: "",
        nextDataset: "d",
        extra: { groupId: null, id: null },
      }),
    ).toBe("/datasets/d");
  });
});
