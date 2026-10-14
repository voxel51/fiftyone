import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  activeLabelSchemas,
  activePathsOrder,
  labelSchemasData,
  schemaDatasetName,
} from "./state";

describe("dataset-scoped schema atoms", () => {
  it("values belong to the dataset they were written under", () => {
    const store = createStore();
    store.set(schemaDatasetName, "quickstart");
    store.set(labelSchemasData, { gt: { type: "detections" } } as never);
    store.set(activeLabelSchemas, ["gt"]);
    store.set(activePathsOrder, ["gt"]);
    expect(store.get(labelSchemasData)).toEqual({ gt: { type: "detections" } });
    expect(store.get(activeLabelSchemas)).toEqual(["gt"]);
    expect(store.get(activePathsOrder)).toEqual(["gt"]);

    // Switching datasets reads as "not loaded" — instantly, with no
    // loader having to remember to clear anything.
    store.set(schemaDatasetName, "short-clips-v4");
    expect(store.get(labelSchemasData)).toBeNull();
    expect(store.get(activeLabelSchemas)).toBeNull();
    expect(store.get(activePathsOrder)).toBeNull();

    // Writes under the new dataset are scoped to it...
    store.set(activeLabelSchemas, ["frames.detections"]);
    expect(store.get(activeLabelSchemas)).toEqual(["frames.detections"]);
    // ...and the old dataset's value is gone, not merely shadowed.
    store.set(schemaDatasetName, "quickstart");
    expect(store.get(activeLabelSchemas)).toBeNull();
  });

  it("works with no dataset bridged (tests, OSS shells)", () => {
    const store = createStore();
    store.set(labelSchemasData, { gt: { type: "detections" } } as never);
    expect(store.get(labelSchemasData)).toEqual({ gt: { type: "detections" } });
  });
});
