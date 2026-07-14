import { cleanup, render, screen } from "@testing-library/react";
import { RecoilRoot } from "recoil";
import { afterEach, describe, expect, it, vi } from "vitest";

const { syncSpy } = vi.hoisted(() => ({ syncSpy: vi.fn() }));

// Stub the shared string filter so we don't pull in its heavy dependency tree;
// this test only cares that TemporalTagsFilter renders it and kicks off the
// results sync.
vi.mock("./StringFilter/StringFilter", () => ({
  default: () => <div data-testid="string-filter" />,
}));

// Provide just the @fiftyone/state surface the component imports.
vi.mock("@fiftyone/state", async () => {
  const { atom, atomFamily } =
    await vi.importActual<typeof import("recoil")>("recoil");
  const family = (key: string) => atomFamily({ key, default: null });
  return {
    useSyncTemporalTagResults: syncSpy,
    temporalTagResults: atom({
      key: "test_temporalTagResults",
      default: { results: [], count: null },
    }),
    isMatchingAtom: family("test_isMatchingAtom"),
    stringExcludeAtom: family("test_stringExcludeAtom"),
    stringSelectedValuesAtom: family("test_stringSelectedValuesAtom"),
  };
});

import TemporalTagsFilter from "./TemporalTagsFilter";

const renderFilter = () =>
  render(
    <RecoilRoot>
      <TemporalTagsFilter
        color="#ffffff"
        path="_temporal_tags"
        modal={false}
        title="temporal tags"
      />
    </RecoilRoot>,
  );

describe("TemporalTagsFilter", () => {
  afterEach(() => {
    syncSpy.mockReset();
    cleanup();
  });

  it("renders the string filter", () => {
    renderFilter();
    expect(screen.getByTestId("string-filter")).toBeTruthy();
  });

  it("kicks off the temporal-tag results sync on mount", () => {
    renderFilter();
    expect(syncSpy).toHaveBeenCalled();
  });
});
