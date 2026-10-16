import { act, cleanup, renderHook } from "@testing-library/react";
import { RecoilRoot } from "recoil";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eventIdentity } from "./event-facets/identity";
import { useSidebarFacet } from "./sidebar-facets";

vi.mock("./recoil/aggregations", async () => {
  const { constSelector } =
    await vi.importActual<typeof import("recoil")>("recoil");
  return {
    aggregationQuery: () =>
      constSelector([
        {
          __typename: "EventAggregation",
          path: "_events",
          total: 2,
          events: [
            { projection: "a", id: "brake", label: "a/Braking", count: 35 },
            { projection: "b", id: "brake", label: "b/Braking", count: 7 },
          ],
        },
      ]),
  };
});
vi.mock("./recoil/filters", async () => {
  const { atomFamily } =
    await vi.importActual<typeof import("recoil")>("recoil");
  return {
    filter: atomFamily<
      { values: string[]; exclude: boolean } | null,
      { modal: boolean; path: string }
    >({
      key: "test_sidebar_facet_filters",
      default: null,
    }),
  };
});

describe("sidebar facets", () => {
  afterEach(cleanup);

  it("uses backend labels and counts while keeping projection identities distinct", () => {
    const { result } = renderHook(() => useSidebarFacet(false, "_events", 0), {
      wrapper: RecoilRoot,
    });
    expect(result.current.values).toEqual([
      { value: '["a","brake"]', label: "a/Braking", count: 35 },
      { value: '["b","brake"]', label: "b/Braking", count: 7 },
    ]);
    act(() => result.current.toggle('["a","brake"]', true));
    expect(result.current.selected).toEqual(['["a","brake"]']);
  });

  it("keeps an off-page selection removable and clears it with reset", () => {
    const { result } = renderHook(() => useSidebarFacet(false, "_events", 0), {
      wrapper: RecoilRoot,
    });
    const missing = eventIdentity({ projection: "a", id: "off-page" });
    act(() => result.current.toggle(missing, true));
    expect(result.current.values[0]).toEqual({
      value: missing,
      label: "a/off-page",
    });
    act(() => result.current.clear());
    expect(result.current.selected).toEqual([]);
    expect(result.current.values).toHaveLength(2);
  });

  it("keeps modal pins independent of grid filters", () => {
    const { result } = renderHook(
      () => ({
        grid: useSidebarFacet(false, "_events", 0),
        modal: useSidebarFacet(true, "_events", 0),
      }),
      { wrapper: RecoilRoot },
    );
    act(() => result.current.modal.toggle('["b","brake"]', true));
    expect(result.current.modal.selected).toEqual(['["b","brake"]']);
    expect(result.current.grid.selected).toEqual([]);
  });
});
