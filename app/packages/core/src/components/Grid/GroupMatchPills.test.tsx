import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  grouped: true,
  view: [] as { _cls: string; kwargs: [string, unknown][] }[],
  published: null as Map<string, string[]> | null,
  options: {} as Record<string, unknown>,
}));

vi.mock("@fiftyone/state", () => ({
  useCurrentDataset: () => ({ groupField: "camera" }),
  useIsGroupDataset: () => env.grouped,
  useLookerOptions: () => env.options,
  usePublishedGroupMatches: () => env.published,
  useView: () => env.view,
}));

import { useGroupMatchTileDecorator } from "./GroupMatchPills";
import { useTileDecorators } from "./tileDecorators";

const searchedFor = (groupMatches: Record<string, string[]>) => [
  {
    _cls: "fiftyone.core.stages.SortBySimilarity",
    kwargs: [
      ["query", "a red car"],
      ["_state", { pipeline: [], group_matches: groupMatches }],
    ] as [string, unknown][],
  },
];

const coloring = (by: string) => ({ by, pool: ["#999999"], seed: 0 });

const SETTING = {
  path: "camera",
  fieldColor: "#ff0000",
  valueColors: [{ value: "right", color: "#00ff00" }],
};

/** The pills the grid would draw on a tile of `groupId`'s group. */
const pillsOf = (groupId: string) => {
  const reader = renderHook(() => useTileDecorators());
  const decorators = reader.result.current;
  reader.unmount();
  const tile = render(
    <>
      {decorators.map((decorator) => (
        <div key={decorator.id}>
          {decorator.render({ camera: { _id: groupId } })}
        </div>
      ))}
    </>,
  );
  const pills = [
    ...tile.container.querySelectorAll<HTMLElement>(
      '[data-cy="group-match-pill"]',
    ),
  ];
  tile.unmount();
  return pills;
};

describe("useGroupMatchTileDecorator", () => {
  beforeEach(() => {
    env.grouped = true;
    env.view = searchedFor({ g1: ["right", "left"], g2: ["left"] });
    env.published = null;
    env.options = { coloring: coloring("field"), customizeColorSetting: [] };
    if (!globalThis.CSS?.supports) {
      vi.stubGlobal("CSS", {
        supports: (_: string, color: unknown) =>
          typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color),
      });
    }
  });
  afterEach(cleanup);

  it("names the slices of a tile's group that matched, best match first", () => {
    const { unmount } = renderHook(() => useGroupMatchTileDecorator());

    const pills = pillsOf("g1");
    expect(pills.map((pill) => pill.textContent)).toStrictEqual([
      "match: right",
      "match: left",
    ]);
    // A pill cut short on a narrow tile still reads in full on hover
    expect(pills.map((pill) => pill.title)).toStrictEqual([
      "match: right",
      "match: left",
    ]);
    expect(pillsOf("g3")).toStrictEqual([]);
    unmount();
  });

  it("names the latest search's matches when searches are stacked", () => {
    env.view = [
      ...searchedFor({ g1: ["left"] }),
      ...searchedFor({ g1: ["right"] }),
    ];
    const { unmount } = renderHook(() => useGroupMatchTileDecorator());

    expect(pillsOf("g1").map((pill) => pill.textContent)).toStrictEqual([
      "match: right",
    ]);
    unmount();
  });

  it("names the matches a search published without a stage", () => {
    env.view = [];
    env.published = new Map([["g1", ["left"]]]);
    const { unmount } = renderHook(() => useGroupMatchTileDecorator());

    expect(pillsOf("g1").map((pill) => pill.textContent)).toStrictEqual([
      "match: left",
    ]);
    unmount();
  });

  it("names the matches of whichever search ran last", () => {
    const { rerender, unmount } = renderHook(() =>
      useGroupMatchTileDecorator(),
    );
    const names = () => pillsOf("g1").map((pill) => pill.textContent);

    env.published = new Map([["g1", ["left"]]]);
    rerender();
    expect(names()).toStrictEqual(["match: left"]);

    env.view = searchedFor({ g1: ["right"] });
    rerender();
    expect(names()).toStrictEqual(["match: right"]);

    env.published = new Map([["g1", ["left"]]]);
    rerender();
    expect(names()).toStrictEqual(["match: left"]);
    unmount();
  });

  it("names the view's search again once published matches clear", () => {
    env.published = new Map([["g1", ["left"]]]);
    const { rerender, unmount } = renderHook(() =>
      useGroupMatchTileDecorator(),
    );
    expect(pillsOf("g1").map((pill) => pill.textContent)).toStrictEqual([
      "match: left",
    ]);

    env.published = null;
    rerender();
    expect(pillsOf("g1").map((pill) => pill.textContent)).toStrictEqual([
      "match: right",
      "match: left",
    ]);
    unmount();
  });

  it("draws nothing without a grouped similarity search in the view", () => {
    env.view = [];
    const unsearched = renderHook(() => useGroupMatchTileDecorator());
    expect(pillsOf("g1")).toStrictEqual([]);
    unsearched.unmount();

    env.view = searchedFor({ g1: ["right"] });
    env.grouped = false;
    const ungrouped = renderHook(() => useGroupMatchTileDecorator());
    expect(pillsOf("g1")).toStrictEqual([]);
    ungrouped.unmount();
  });

  it("colors by the group field's color, or by each slice's value", () => {
    env.options = {
      coloring: coloring("field"),
      customizeColorSetting: [SETTING],
    };
    const byField = renderHook(() => useGroupMatchTileDecorator());
    expect(
      pillsOf("g1").map((pill) => pill.style.backgroundColor),
    ).toStrictEqual(["rgb(255, 0, 0)", "rgb(255, 0, 0)"]);
    byField.unmount();

    env.options = {
      coloring: coloring("value"),
      customizeColorSetting: [SETTING],
    };
    const byValue = renderHook(() => useGroupMatchTileDecorator());
    const [right, left] = pillsOf("g1").map(
      (pill) => pill.style.backgroundColor,
    );
    expect(right).toBe("rgb(0, 255, 0)");
    expect(left).not.toBe("rgb(0, 255, 0)");
    expect(left).not.toBe("rgb(255, 0, 0)");
    byValue.unmount();
  });
});
