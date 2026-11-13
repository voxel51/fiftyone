import { expect, it, vi } from "vitest";

vi.mock("@fiftyone/relay", () => ({ subscribe: () => () => undefined }));
vi.mock("@fiftyone/state", () => ({
  hiddenLabels: "hiddenLabels",
  savedLookerOptions: "savedLookerOptions",
  similaritySorting: "similaritySorting",
}));

import onSetSimilarityParameters from "./onSetSimilarityParameters";
import type { RegisteredSetter } from "./registerSetter";

it("keeps selected samples, labels, and their styles when similarity results reload", () => {
  const selectedSamples = new Map([["sample", "positive"]]);
  const selectedLabels = [{ sampleId: "sample", labelId: "label" }];
  const session = {
    selectedSamples,
    selectedLabels,
    sampleSelectionStyle: "custom",
  };
  const load = vi.fn();
  onSetSimilarityParameters({
    router: { load },
    sessionRef: { current: session },
  } as unknown as Parameters<RegisteredSetter>[0])({} as never, {});

  expect(load).toHaveBeenCalledWith(true);
  expect(session.selectedSamples).toBe(selectedSamples);
  expect(session.selectedLabels).toBe(selectedLabels);
  expect(session.sampleSelectionStyle).toBe("custom");
});
