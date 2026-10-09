/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { appRoutes } from "./routes";

describe("appRoutes.parse", () => {
  it("reads the index", () => {
    expect(appRoutes.parse("/")).toEqual({ kind: "index" });
  });

  it("reads a dataset", () => {
    expect(appRoutes.parse("/datasets/quickstart")).toEqual({
      kind: "dataset",
      name: "quickstart",
    });
  });

  it("reads a sample and a group", () => {
    expect(appRoutes.parse("/datasets/quickstart/samples/66a1")).toEqual({
      kind: "sample",
      name: "quickstart",
      id: "66a1",
    });
    expect(appRoutes.parse("/datasets/quickstart/groups/g-7")).toEqual({
      kind: "group",
      name: "quickstart",
      groupId: "g-7",
    });
  });

  it("decodes path segments", () => {
    expect(appRoutes.parse("/datasets/my%20dataset")).toEqual({
      kind: "dataset",
      name: "my dataset",
    });
  });

  it("keeps a path it does not serve", () => {
    for (const path of [
      "/datasets",
      "/settings/audit",
      "/datasets/quickstart/manage",
      "/datasets/quickstart/samples",
    ]) {
      expect(appRoutes.parse(path)).toEqual({ kind: "unknown", path });
    }
  });
});

describe("appRoutes round trip", () => {
  it.each([
    "/",
    "/datasets/quickstart",
    "/datasets/quickstart/samples/66a1",
    "/datasets/quickstart/groups/g-7",
    "/datasets/my%20dataset",
    "/settings/audit",
    "/datasets/quickstart/manage",
  ])("survives %s", (path) => {
    expect(appRoutes.format(appRoutes.parse(path))).toBe(path);
  });
});

describe("appRoutes.scopes", () => {
  it("names the dataset, and the sample when there is one", () => {
    expect(appRoutes.scopes({ kind: "dataset", name: "quickstart" })).toEqual({
      dataset: "quickstart",
    });
    expect(
      appRoutes.scopes({ kind: "sample", name: "quickstart", id: "66a1" }),
    ).toEqual({ dataset: "quickstart", sample: "66a1" });
  });

  it("treats a group as the sample subject", () => {
    expect(
      appRoutes.scopes({ kind: "group", name: "quickstart", groupId: "g-7" }),
    ).toEqual({ dataset: "quickstart", sample: "g-7" });
  });

  it("names nothing off a dataset", () => {
    expect(appRoutes.scopes({ kind: "index" })).toEqual({});
    expect(appRoutes.scopes({ kind: "unknown", path: "/settings" })).toEqual(
      {},
    );
  });
});
