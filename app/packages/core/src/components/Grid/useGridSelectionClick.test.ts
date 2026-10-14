import type { EpisodeSelection } from "@fiftyone/state/src/selection";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useGridSelectionClick from "./useGridSelectionClick";
import BoundedMap from "./BoundedMap";

afterEach(cleanup);

function setup(count = 10) {
  const records = new Map(
    Array.from({ length: count }, (_, index) => [String(index), index]),
  );
  const captures = new Map<string, Map<string, EpisodeSelection>>();
  // Picks land in the active section; the grid hook decides which.
  const selection = {
    domainId: "dataset",
    scopeKey: "view",
    captures,
    active: "first",
    select: vi.fn(async (ids: readonly string[]) => {
      const bucketId = selection.active;
      const next = new Map(captures.get(bucketId));
      for (const id of ids)
        next.set(id, {
          episodeId: id,
          members: [{ episodeId: id, kind: "episode" }],
        });
      captures.set(bucketId, next);
    }),
    toggle: vi.fn(async (id: string) => {
      const bucketId = selection.active;
      const next = new Map(captures.get(bucketId));
      if (next.delete(id)) captures.set(bucketId, next);
      else await selection.select([id]);
    }),
  };
  const page = vi.fn(async (_index: number) => undefined);
  const view = renderHook((props) => useGridSelectionClick(props), {
    initialProps: { records, selection, page },
  });
  /** Click `id` with `bucket` active. */
  const pick = (id: string, bucket: string, shiftKey: boolean) => {
    selection.active = bucket;
    return view.result.current(id, shiftKey);
  };
  const ids = (bucket: string) =>
    [...(captures.get(bucket)?.keys() ?? [])].sort();
  return { ...view, records, selection, page, ids, pick };
}

describe("section-aware grid ranges", () => {
  it("starts at the last selection, not the nearest selected tile", async () => {
    const { pick, ids } = setup();
    await pick("6", "first", false);
    await pick("1", "first", false);
    await pick("8", "first", true);
    expect(ids("first")).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });

  it("keeps an anchor per section and preserves other sections and unrelated selections", async () => {
    const { pick, ids } = setup();
    await pick("9", "first", false);
    await pick("1", "first", false);
    await pick("7", "second", false);
    await pick("5", "third", false);
    await pick("3", "first", true);
    await pick("9", "second", true);
    await pick("3", "third", true);
    expect(ids("first")).toEqual(["1", "2", "3", "9"]);
    expect(ids("second")).toEqual(["7", "8", "9"]);
    expect(ids("third")).toEqual(["3", "4", "5"]);
  });

  it("adds ranges backwards even when the endpoint is already selected", async () => {
    const { pick, ids } = setup();
    await pick("2", "first", false);
    await pick("6", "first", false);
    await pick("2", "first", true);
    expect(ids("first")).toEqual(["2", "3", "4", "5", "6"]);
    await pick("0", "first", true);
    expect(ids("first")).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
  });

  it("selects only the endpoint without an anchor, including after a clear or deselection", async () => {
    const { pick, selection, ids } = setup();
    await pick("1", "first", true);
    expect(ids("first")).toEqual(["1"]);
    selection.captures.clear();
    await pick("4", "first", true);
    expect(ids("first")).toEqual(["4"]);
    await pick("4", "first", false);
    await pick("8", "first", true);
    expect(ids("first")).toEqual(["8"]);
  });

  it("forgets anchors when the view or dataset changes", async () => {
    const { pick, rerender, selection, records, page } = setup();
    await pick("1", "first", false);
    rerender({
      records,
      selection: { ...selection, scopeKey: "filtered" },
      page,
    });
    await pick("5", "first", true);
    expect(selection.select).toHaveBeenLastCalledWith(["5"]);
    rerender({ records, selection: { ...selection, domainId: "other" }, page });
    await pick("8", "first", true);
    expect(selection.select).toHaveBeenLastCalledWith(["8"]);
  });

  it("loads missing pages so a range includes tiles skipped while scrolling", async () => {
    const { pick, records, page, ids } = setup(42);
    for (let i = 20; i < 40; i++) records.delete(String(i));
    page.mockImplementation(async (index) => {
      for (let i = index * 20; i < (index + 1) * 20; i++)
        records.set(String(i), i);
    });
    await pick("18", "first", false);
    await pick("41", "first", true);
    expect(page).toHaveBeenCalledExactlyOnceWith(1);
    expect(ids("first")).toEqual(
      Array.from({ length: 24 }, (_, i) => String(i + 18)).sort(),
    );
  });

  it("does not select a partial range when a missing page cannot be loaded", async () => {
    const { pick, records, ids } = setup();
    records.delete("3");
    await pick("1", "first", false);
    await pick("5", "first", true);
    expect(ids("first")).toEqual(["1"]);
  });

  it("drops a range lookup that finishes after the grid order changed", async () => {
    const { pick, rerender, records, selection, page, ids } = setup();
    records.delete("3");
    let finish = () => undefined;
    page.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await pick("1", "first", false);
    const pending = pick("5", "first", true);
    rerender({ records: new Map(records), selection, page });
    records.set("3", 3);
    finish();
    await pending;
    expect(ids("first")).toEqual(["1"]);
  });
  it("keeps a range anchor and collects fetched IDs while the navigation cache evicts", async () => {
    const { result, rerender, selection, page } = setup();
    const records = new BoundedMap<string, number>(20);
    for (let i = 0; i < 20; i++) records.set(String(i), i);
    rerender({ records, selection, page });
    await result.current("1", false);
    for (let i = 60; i < 80; i++) records.set(String(i), i);
    expect(records.has("1")).toBe(false);
    page.mockImplementation(async (pageNumber) => {
      for (let i = pageNumber * 20; i < (pageNumber + 1) * 20; i++)
        records.set(String(i), i);
    });
    await result.current("65", true);
    expect(selection.select).toHaveBeenLastCalledWith(
      Array.from({ length: 65 }, (_, i) => String(i + 1)),
    );
  });
});
