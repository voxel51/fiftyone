// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { RecoilRoot } from "recoil";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFetch,
  mockSetSelected,
  mockUseRecoilValue,
  mockUseRecoilValueLoadable,
  snapshotValues,
} = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockSetSelected: vi.fn(),
  mockUseRecoilValue: vi.fn(),
  mockUseRecoilValueLoadable: vi.fn(),
  snapshotValues: new Map<unknown, unknown>(),
}));

vi.mock("@fiftyone/components", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/components")>();
  return {
    ...actual,
    PillButton: ({
      onClick,
      title,
      highlight,
      icon,
      ...rest
    }: {
      onClick?: () => void;
      title?: string;
      highlight?: boolean;
      icon?: React.ReactNode;
      [key: string]: unknown;
    }) => (
      <button
        type="button"
        onClick={onClick}
        title={title}
        data-highlight={String(Boolean(highlight))}
        data-cy={rest["data-cy"] as string | undefined}
      >
        {icon}
        {title}
      </button>
    ),
  };
});

vi.mock("@voxel51/voodo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@voxel51/voodo")>();
  return {
    ...actual,
    ChecklistIcon: () => <span data-testid="checklist-icon" />,
  };
});

vi.mock("../../../Actions/Loading", () => ({
  default: () => <span data-testid="loading-icon" />,
}));

vi.mock("@fiftyone/utilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/utilities")>();
  return {
    ...actual,
    getFetchFunction: () => mockFetch,
  };
});

vi.mock("@fiftyone/state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/state")>();
  const atoms = {
    datasetName: { key: "datasetName" },
    view: { key: "view" },
    filters: { key: "filters" },
    extendedStages: { key: "extendedStages" },
    isGroup: { key: "isGroup" },
    groupSlice: { key: "groupSlice" },
    selectedSamples: { key: "selectedSamples" },
    elementNames: { key: "elementNames" },
    count: (params: unknown) => ({ key: "count", params }),
  };
  return {
    ...actual,
    ...atoms,
    useSetSelected: () => mockSetSelected,
  };
});

vi.mock("recoil", async () => {
  const actual = await vi.importActual<typeof import("recoil")>("recoil");
  return {
    ...actual,
    useRecoilValue: (atom: unknown) => mockUseRecoilValue(atom),
    useRecoilValueLoadable: (atom: unknown) => mockUseRecoilValueLoadable(atom),
    useRecoilCallback:
      (
        cb: (helpers: {
          snapshot: { getPromise: (atom: unknown) => Promise<unknown> };
          set: (atom: unknown, val: unknown) => void;
        }) => () => Promise<void>,
      ) =>
      () =>
        cb({
          snapshot: {
            getPromise: async (atom: unknown) => snapshotValues.get(atom),
          },
          set: (atom: unknown, val: unknown) => {
            if ((atom as { key?: string })?.key === "selectedSamples") {
              mockSetSelected(val);
            }
          },
        })(),
  };
});

import * as fos from "@fiftyone/state";
import SelectAll from "./index";

describe("Grid SelectAll action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotValues.clear();
    snapshotValues.set(fos.datasetName, "my-dataset");
    snapshotValues.set(fos.view, [
      { _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 10]] },
    ]);
    snapshotValues.set(fos.filters, {
      tags: { values: ["cat"], exclude: false },
    });
    snapshotValues.set(fos.extendedStages, {});
    snapshotValues.set(fos.isGroup, false);
    snapshotValues.set(fos.groupSlice, undefined);

    mockUseRecoilValue.mockImplementation((atom: unknown) => {
      if (atom === fos.selectedSamples) return new Map();
      if (atom === fos.elementNames)
        return { singular: "sample", plural: "samples" };
      return undefined;
    });
    mockUseRecoilValueLoadable.mockReturnValue({
      state: "hasValue",
      contents: 3,
    });
  });

  it("fetches all sample IDs in the current view and selects them", async () => {
    mockFetch.mockResolvedValueOnce({
      aggregate: [["id-1", "id-2", "id-3"]],
    });

    render(
      <RecoilRoot>
        <SelectAll />
      </RecoilRoot>,
    );

    const btn = screen.getByRole("button", {
      name: "Select all samples in view",
    });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("POST", "/aggregate", {
        dataset: "my-dataset",
        view: [{ _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 10]] }],
        filters: { tags: { values: ["cat"], exclude: false } },
        extended: {},
        slice: undefined,
        aggregations: [
          {
            _cls: "fiftyone.core.aggregations.Values",
            kwargs: [["field_or_expr", "id"]],
          },
        ],
      });
    });

    await waitFor(() => {
      expect(mockSetSelected).toHaveBeenCalledTimes(1);
      const selectedArg = mockSetSelected.mock.calls[0][0] as Map<
        string,
        string
      >;
      expect([...selectedArg.entries()]).toEqual([
        ["id-1", "default"],
        ["id-2", "default"],
        ["id-3", "default"],
      ]);
    });
  });

  it("deselects all samples when all samples in view are already selected", () => {
    mockUseRecoilValue.mockImplementation((atom: unknown) => {
      if (atom === fos.selectedSamples) {
        return new Map([
          ["id-1", "default"],
          ["id-2", "default"],
          ["id-3", "default"],
        ]);
      }
      if (atom === fos.elementNames)
        return { singular: "sample", plural: "samples" };
      return undefined;
    });

    render(
      <RecoilRoot>
        <SelectAll />
      </RecoilRoot>,
    );

    const btn = screen.getByRole("button", { name: "Deselect all samples" });
    expect(btn.getAttribute("data-highlight")).toBe("true");
    fireEvent.click(btn);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSetSelected).toHaveBeenCalledWith(new Map());
  });

  it("does nothing when the current view is empty", () => {
    mockUseRecoilValueLoadable.mockReturnValue({
      state: "hasValue",
      contents: 0,
    });

    render(
      <RecoilRoot>
        <SelectAll />
      </RecoilRoot>,
    );

    const btn = screen.getByRole("button", { name: "No samples in view" });
    fireEvent.click(btn);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSetSelected).not.toHaveBeenCalled();
  });
});
