import { describe, expect, it } from "vitest";
import { resolveURL } from "./utils";

describe("resolves datasets", () => {
  it("resolves to /", () => {
    expect(
      resolveURL({
        currentPathname: "/datasets/my-dataset",
        currentSearch: "",
        nextDataset: null,
      })
    ).toBe("/");
    expect(
      resolveURL({ currentPathname: "/datasets/my-dataset", currentSearch: "" })
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
      })
    ).toBe(`/my/proxy?proxy=${encodeURIComponent("/my/proxy")}`);
    expect(
      resolveURL({
        currentPathname: "/my/proxy/datasets/my-dataset",
        currentSearch: "?proxy=/my/proxy",
      })
    ).toBe(
      `/my/proxy/datasets/my-dataset?proxy=${encodeURIComponent("/my/proxy")}`
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
      })
    ).toThrowError();
  });

  it("throws error", () => {
    expect(() =>
      resolveURL({
        currentPathname: "",
        currentSearch: "",
        nextView: "view",
      })
    ).toThrowError();
  });

  it("resolves with saved view", () => {
    expect(
      resolveURL({
        currentPathname: "/datasets/my-dataset",
        currentSearch: "",
        nextDataset: "my-dataset",
        nextView: "view",
      })
    ).toBe(`/datasets/my-dataset?view=view`);
  });
});

describe("resolves current", () => {
  it("does not change location", () => {
    expect(
      resolveURL({
        currentPathname: "/datasets/my-dataset",
        currentSearch: "?view=view",
      })
    ).toBe("/datasets/my-dataset?view=view");
  });
});
