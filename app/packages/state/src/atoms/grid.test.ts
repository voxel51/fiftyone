import { describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/reverb");
vi.mock("@fiftyone/relay");

import type { TestSelector } from "../../../reverb/src/__mocks__/index";
import { setMockAtoms } from "../../../reverb/src/__mocks__/index";
import { multimodalGridFit, type MultimodalGridFit } from "./grid";

type WritableFitSelector = TestSelector<typeof multimodalGridFit> & {
  set: (value: MultimodalGridFit) => void;
};

describe("multimodalGridFit", () => {
  it("defaults invalid persisted values to cover", () => {
    const fit = multimodalGridFit as unknown as WritableFitSelector;
    setMockAtoms({
      datasetId: "grid-fit-default",
      multimodalGridFitStore: () => "unexpected",
    });

    expect(fit()).toBe("cover");
  });

  it("stores the preference independently for each dataset", () => {
    const fit = multimodalGridFit as unknown as WritableFitSelector;
    setMockAtoms({
      datasetId: "grid-fit-first",
      multimodalGridFitStore: () => "cover",
    });

    fit.set("contain");
    expect(fit()).toBe("contain");

    setMockAtoms({ datasetId: "grid-fit-second" });
    expect(fit()).toBe("cover");

    setMockAtoms({ datasetId: "grid-fit-first" });
    expect(fit()).toBe("contain");
  });
});

describe("grid sort fields", () => {
  type Read<T> = () => T;

  it("counts a dataset above the SMALL order size as large", async () => {
    const { gridLargeCollection, SMALL_ORDER_SIZE } = await import("./grid");
    const large = gridLargeCollection as unknown as Read<boolean>;
    setMockAtoms({ datasetSampleCount: SMALL_ORDER_SIZE });
    expect(large()).toBe(false);
    setMockAtoms({ datasetSampleCount: SMALL_ORDER_SIZE + 1 });
    expect(large()).toBe(true);
  });

  it("offers only indexed sortable fields above 100k, whatever their type", async () => {
    const { gridSortFields } = await import("./grid");
    const fields = gridSortFields as unknown as Read<string[]>;
    setMockAtoms({
      gridLargeCollection: true,
      indexInfo: { indexedSortFields: ["score", "camera", "captured_at"] },
      queryPerformance: false,
    });
    expect(fields()).toEqual(["camera", "captured_at", "score"]);

    setMockAtoms({ indexInfo: { indexedSortFields: null } });
    expect(fields()).toEqual([]);
  });

  it("offers numeric fields of a small dataset without query performance", async () => {
    const { gridSortFields } = await import("./grid");
    const fields = gridSortFields as unknown as Read<string[]>;
    setMockAtoms({
      gridLargeCollection: false,
      queryPerformance: false,
      fields: () => [{ path: "score" }, { path: "camera" }, { path: "a.b" }],
      isNumericField: (path: string) => path !== "camera",
    });
    expect(fields()).toEqual(["score"]);
  });
});
