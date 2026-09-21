/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { memoryHarness } from "../testing";
import { defineParam } from "./param";
import type { RouteCodec } from "./route";
import { createLocationStore } from "./store";

type Route =
  | { kind: "root" }
  | { kind: "dataset"; name: string }
  | { kind: "sample"; name: string; id: string };

const codec: RouteCodec<Route> = {
  parse(pathname) {
    const [name, id] = pathname.split("/").filter(Boolean);
    if (!name) return { kind: "root" };
    if (id) return { kind: "sample", name, id };
    return { kind: "dataset", name };
  },
  format(route) {
    if (route.kind === "root") return "/";
    if (route.kind === "dataset") return `/${route.name}`;
    return `/${route.name}/${route.id}`;
  },
  scopes(route) {
    if (route.kind === "dataset") return { dataset: route.name };
    if (route.kind === "sample")
      return { dataset: route.name, sample: route.id };
    return {};
  },
};

const mode = defineParam<"explore" | "annotate">({
  key: "store.mode",
  parse: (raw) => (raw === "annotate" ? "annotate" : "explore"),
  format: (value) => (value === "annotate" ? "annotate" : undefined),
  history: "replace",
  scope: "dataset",
});

const zoom = defineParam<number>({
  key: "store.zoom",
  parse: (raw) => (raw ? Number(raw) : 1),
  format: (value) => (value === 1 ? undefined : String(value)),
  history: "push",
  scope: "sample",
});

const build = (initial: string) => {
  const harness = memoryHarness(initial);
  return { harness, store: createLocationStore(harness.adapter, codec) };
};

describe("snapshots", () => {
  it("returns the same model until the location changes", () => {
    const { store } = build("/quickstart");
    expect(store.get()).toBe(store.get());
  });

  it("returns the same parsed param until the location changes", () => {
    const { store } = build("/quickstart?store.mode=annotate");
    expect(store.read(mode)).toBe(store.read(mode));
    expect(store.read(mode)).toBe("annotate");
  });

  it("returns a fresh model after a write", () => {
    const { store } = build("/quickstart");
    const before = store.get();
    store.write(mode, "annotate");
    expect(store.get()).not.toBe(before);
    expect(store.read(mode)).toBe("annotate");
  });
});

describe("writes", () => {
  it("drops the key when format returns undefined", () => {
    const { store } = build("/quickstart?store.mode=annotate");
    store.write(mode, "explore");
    expect(store.get().params).toEqual({});
  });

  it("honors each param's history policy", () => {
    const replaced = build("/quickstart");
    const depth = replaced.harness.depth();
    replaced.store.write(mode, "annotate");
    expect(replaced.harness.depth()).toBe(depth);

    const pushed = build("/quickstart/abc");
    pushed.store.write(zoom, 4);
    expect(pushed.harness.depth()).toBe(2);
  });

  it("does not touch history when the URL would not change", () => {
    const { harness, store } = build("/quickstart?store.mode=annotate");
    const depth = harness.depth();
    store.write(mode, "annotate");
    expect(harness.adapter.get()).toBe("/quickstart?store.mode=annotate");
    expect(harness.depth()).toBe(depth);
  });

  it("leaves params nobody claims alone", () => {
    const { store } = build("/quickstart?proxy=%2Ffoo&debug=1");
    store.write(mode, "annotate");
    expect(store.get().params).toEqual({
      proxy: "/foo",
      debug: "1",
      "store.mode": "annotate",
    });
  });
});

describe("scope clearing", () => {
  it("clears sample-scoped params when the sample changes", () => {
    const { store } = build("/quickstart/a?store.zoom=4&store.mode=annotate");
    store.push({
      ...store.get(),
      route: { kind: "sample", name: "quickstart", id: "b" },
    });
    expect(store.get().params).toEqual({ "store.mode": "annotate" });
  });

  it("clears dataset-scoped params when the dataset changes", () => {
    const { store } = build("/quickstart?store.mode=annotate&debug=1");
    store.push({ ...store.get(), route: { kind: "dataset", name: "other" } });
    expect(store.get().params).toEqual({ debug: "1" });
  });

  it("clears sample scope when the dataset changes too", () => {
    const { store } = build("/quickstart/a?store.zoom=4");
    store.push({ ...store.get(), route: { kind: "dataset", name: "other" } });
    expect(store.get().params).toEqual({});
  });

  it("keeps everything when the scope tokens are unchanged", () => {
    const { store } = build("/quickstart/a?store.zoom=4&store.mode=annotate");
    store.replace({ ...store.get(), params: { ...store.get().params } });
    expect(store.get().params).toEqual({
      "store.zoom": "4",
      "store.mode": "annotate",
    });
  });
});

describe("generation", () => {
  it("advances on a write", () => {
    const { store } = build("/quickstart");
    const before = store.generation();
    store.write(mode, "annotate");
    expect(store.isCurrent(before)).toBe(false);
    expect(store.isCurrent(store.generation())).toBe(true);
  });

  it("advances on a pop, which no request can prevent", () => {
    const { harness, store } = build("/quickstart");
    store.write(zoom, 4);
    const inFlight = store.generation();
    harness.back();
    expect(store.isCurrent(inFlight)).toBe(false);
  });

  it("does not advance when a write changes nothing", () => {
    const { store } = build("/quickstart?store.mode=annotate");
    const before = store.generation();
    store.write(mode, "annotate");
    expect(store.isCurrent(before)).toBe(true);
  });
});
