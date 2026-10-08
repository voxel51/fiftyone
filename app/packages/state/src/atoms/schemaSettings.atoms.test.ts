import * as fos from "@fiftyone/state";
import { DEFAULT_VALUE } from "@fiftyone/reverb";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import * as ss from "./schemaSettings.atoms";

const TEST_DS = { name: "test-dataset", mediaType: "image" };

const initialize = () => {
  const store = createStore();
  store.set(fos.dataset, TEST_DS as fos.State.Dataset);
  return store;
};

describe("excludedPathsState", () => {
  it("defaults to an empty set without a field visibility stage", () => {
    const store = initialize();

    const contents = store.get(ss.excludedPathsState({}));

    expect(contents[TEST_DS.name]).toEqual(new Set());
  });

  it("reset returns to the derived default", () => {
    const store = initialize();
    store.set(ss.excludedPathsState({}), {
      [TEST_DS.name]: new Set(["metadata"]),
    });
    expect(store.get(ss.excludedPathsState({}))[TEST_DS.name]).toEqual(
      new Set(["metadata"]),
    );

    store.set(ss.excludedPathsState({}), DEFAULT_VALUE);
    expect(store.get(ss.excludedPathsState({}))[TEST_DS.name]).toEqual(
      new Set(),
    );
  });
});
