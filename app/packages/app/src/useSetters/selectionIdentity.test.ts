import { expect, it } from "vitest";
import { changesHistorySampleIdentity } from "./selectionIdentity";

const patches = {
  view: [
    {
      _cls: "fiftyone.core.stages.ToPatches",
      kwargs: [["field", "predictions"]],
    },
  ],
};
const emptyQuery = { savedViewSlug: "all", view: [], viewResolved: true };

it("clears incompatible IDs in both directions through a resolved empty saved query", () => {
  expect(changesHistorySampleIdentity(emptyQuery, patches)).toBe(true);
  expect(changesHistorySampleIdentity(patches, emptyQuery)).toBe(true);
});

it("preserves sample IDs across an empty saved query and an ordinary view", () => {
  expect(changesHistorySampleIdentity(emptyQuery, { view: [] })).toBe(false);
});

it("defers identity reconciliation for an unresolved direct link", () => {
  const unresolved = { savedViewSlug: "patches", view: [] };
  expect(changesHistorySampleIdentity(unresolved, patches)).toBe(false);
  expect(changesHistorySampleIdentity(patches, unresolved)).toBe(false);
});
