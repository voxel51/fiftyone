/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createLocationStore } from "@fiftyone/location";
import { memoryHarness } from "@fiftyone/location/src/testing";
import { describe, expect, it } from "vitest";
import { readModal, writeModal } from "./modal";

const build = (href = "/datasets/d") => {
  const harness = memoryHarness(href);
  const store = createLocationStore(harness.adapter, {
    parse: (path: string) => path,
    format: (path: string) => path,
    scopes: () => ({ dataset: "d" }),
  });
  return { harness, store };
};

describe("writeModal", () => {
  it("pushes an open and goes back to the grid on close", () => {
    const { harness, store } = build();
    writeModal(store, { id: "a" });
    expect(harness.adapter.get()).toBe("/datasets/d?id=a");
    expect(harness.depth()).toBe(2);

    writeModal(store, null);
    expect(harness.adapter.get()).toBe("/datasets/d");
    // back, not a new entry: Forward reopens the sample
    expect(harness.depth()).toBe(2);
  });

  it("replaces a step to another sample, and still closes back", () => {
    const { harness, store } = build();
    writeModal(store, { id: "a" });
    writeModal(store, { id: "b" });
    expect(harness.adapter.get()).toBe("/datasets/d?id=b");
    expect(harness.depth()).toBe(2);

    writeModal(store, undefined);
    expect(harness.adapter.get()).toBe("/datasets/d");
    // on the first entry: a push truncates the sample's entry away
    harness.adapter.push("/datasets/d?slice=x");
    expect(harness.depth()).toBe(2);
  });

  it("names a group's sample by its group", () => {
    const { harness, store } = build("/datasets/d?slice=left");
    writeModal(store, { groupId: "g", id: "a" });
    expect(harness.adapter.get()).toBe("/datasets/d?groupId=g&slice=left");
    expect(readModal(store)).toEqual({ groupId: "g" });
  });

  it("replaces a close when the entry before is not the App's grid", () => {
    const { harness, store } = build("/datasets/d?id=a");
    writeModal(store, null);
    expect(harness.adapter.get()).toBe("/datasets/d");
    expect(harness.depth()).toBe(1);
  });

  it("does not touch history when the URL moved first, as on Back", () => {
    const { harness, store } = build();
    writeModal(store, { id: "a" });
    harness.back();
    writeModal(store, null);
    expect(harness.adapter.get()).toBe("/datasets/d");
    expect(harness.depth()).toBe(2);

    // Forward lands on the sample, but the entry before it is no longer known
    harness.adapter.push("/datasets/d?id=a");
    writeModal(store, { id: "a" });
    writeModal(store, null);
    expect(harness.depth()).toBe(2);
    expect(harness.adapter.get()).toBe("/datasets/d");
  });
});
