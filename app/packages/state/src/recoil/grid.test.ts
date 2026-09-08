import { describe, expect, it, vi } from "vitest";

vi.mock("recoil");
vi.mock("recoil-relay");

import type { TestSelector } from "../../../../__mocks__/recoil";
import { setMockAtoms } from "../../../../__mocks__/recoil";
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
