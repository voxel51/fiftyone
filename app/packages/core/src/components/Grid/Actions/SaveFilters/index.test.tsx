// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { TransactionInterface_UNSTABLE } from "recoil";

// The regression under test: the bookmark's post-save reset runs inside a
// Recoil transaction, where atom effects don't fire, so it must clear the
// extended selection through the shared transaction-safe mechanism — a bare
// reset leaves the fragment-read mirror to resurrect the selection on the
// refetch the save itself triggers.

type SubscribeCallback = (
  page: unknown,
  transaction: Pick<TransactionInterface_UNSTABLE, "set" | "reset">,
) => void;

const captured: { subscription: SubscribeCallback | null } = {
  subscription: null,
};

vi.mock("@fiftyone/relay", () => ({
  subscribe: (cb: SubscribeCallback) => {
    captured.subscription = cb;
    return vi.fn();
  },
}));

const fosMock = vi.hoisted(() => ({
  savingFilters: { key: "savingFilters" },
  extendedSelection: { key: "extendedSelection" },
  selectedSamples: { key: "selectedSamples" },
  similarityParameters: { key: "similarityParameters" },
  excludedPathsState: vi.fn(() => ({ key: "excludedPaths" })),
  datasetName: { key: "datasetName" },
  hasFilters: vi.fn(() => ({ key: "hasFilters" })),
  fieldVisibilityStage: { key: "fieldVisibilityStage" },
  datasetId: { key: "datasetId" },
  filters: { key: "filters" },
  extendedStages: { key: "extendedStages" },
  view: { key: "view" },
  viewStateForm_INTERNAL: { key: "viewStateForm_INTERNAL" },
  gridSortBy: { key: "gridSortBy" },
  gridSortByStore: vi.fn(() => ({ key: "gridSortByStore" })),
  gridSortDescendingStore: vi.fn(() => ({ key: "gridSortDescendingStore" })),
  resetExtendedSelectionTransaction: vi.fn(),
}));
vi.mock("@fiftyone/state", () => fosMock);

vi.mock("recoil", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recoil")>()),
  selector: (config: unknown) => config,
  useRecoilValue: (state: unknown) =>
    // `savingFilters` reads false; the bookmark-visibility selector true
    state !== fosMock.savingFilters,
  useRecoilCallback: (factory: (i: unknown) => () => Promise<void>) =>
    factory({
      set: vi.fn(),
      snapshot: {
        getPromise: async (state: unknown) => {
          if (state === fosMock.savingFilters) return false;
          if (state === fosMock.selectedSamples) return new Map();
          if (state === fosMock.datasetId) return "ds";
          return undefined;
        },
      },
    }),
}));

vi.mock("@fiftyone/components", () => ({
  PillButton: (props: { onClick: () => void; title: string }) => (
    <button onClick={props.onClick}>{props.title}</button>
  ),
}));
vi.mock("@mui/icons-material", () => ({ Bookmark: () => null }));
vi.mock("../../../Actions/Loading", () => ({ default: () => null }));
vi.mock("../../../Actions/utils", () => ({
  ActionDiv: (props: { children: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  getStringAndNumberProps: () => ({}),
}));

import SaveFilters from "./index";

describe("SaveFilters", () => {
  it("clears the extended selection through the transaction-safe mechanism after saving", async () => {
    render(<SaveFilters adaptiveMenuItemProps={undefined} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(captured.subscription).not.toBeNull();

    const transaction = { set: vi.fn(), reset: vi.fn() };
    captured.subscription?.(null, transaction);

    expect(fosMock.resetExtendedSelectionTransaction).toHaveBeenCalledWith(
      transaction,
    );
    // The bare reset is exactly the stale-mirror bug; only the mechanism
    // above may clear the selection atoms
    expect(transaction.reset).not.toHaveBeenCalledWith(
      fosMock.extendedSelection,
    );
  });
});
