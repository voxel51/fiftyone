import { cleanup, render, screen } from "@testing-library/react";
import { RecoilRoot } from "recoil";
import { afterEach, describe, expect, it, vi } from "vitest";

const { countsSpy } = vi.hoisted(() => ({ countsSpy: vi.fn() }));

// Stub the shared string filter so we don't pull in its heavy dependency tree;
// this test only cares what TemporalTagsFilter hands it.
vi.mock("./StringFilter/StringFilter", () => ({
  default: () => <div data-testid="string-filter" />,
}));

// Provide just the @fiftyone/state surface the component imports.
vi.mock("@fiftyone/state", async () => {
  const { atom, atomFamily } =
    await vi.importActual<typeof import("recoil")>("recoil");
  const family = (key: string) => atomFamily({ key, default: null });
  const counts = atom({
    key: "test_temporalTagCounts",
    default: { results: [], count: null },
  });
  countsSpy.mockReturnValue(counts);
  return {
    temporalTagCounts: countsSpy,
    isMatchingAtom: family("test_isMatchingAtom"),
    stringExcludeAtom: family("test_stringExcludeAtom"),
    stringSelectedValuesAtom: family("test_stringSelectedValuesAtom"),
  };
});

import TemporalTagsFilter from "./TemporalTagsFilter";

const renderFilter = (modal: boolean) =>
  render(
    <RecoilRoot>
      <TemporalTagsFilter
        color="#ffffff"
        path="_temporal_tags"
        modal={modal}
        title="temporal tags"
      />
    </RecoilRoot>,
  );

describe("TemporalTagsFilter", () => {
  afterEach(() => {
    countsSpy.mockClear();
    cleanup();
  });

  it("offers the counts scoped to its own sidebar", () => {
    renderFilter(true);
    expect(screen.getByTestId("string-filter")).toBeTruthy();
    expect(countsSpy).toHaveBeenCalledWith({ modal: true, extended: false });
  });
});
