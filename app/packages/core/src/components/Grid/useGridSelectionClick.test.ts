import type { EpisodeSelection } from "@fiftyone/state/src/selection";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useGridSelectionClick from "./useGridSelectionClick";

afterEach(cleanup);

function setup(count = 10) {
  const records = new Map(
    Array.from({ length: count }, (_, index) => [String(index), index]),
  );
  const captures = new Map<string, Map<string, EpisodeSelection>>();
  const selection = {
    domainId: "dataset",
    scopeKey: "view",
    captures,
    select: vi.fn(async (ids: readonly string[], bucketId = "first") => {
      const next = new Map(captures.get(bucketId));
      for (const id of ids)
        next.set(id, {
          episodeId: id,
          members: [{ episodeId: id, kind: "episode" }],
        });
      captures.set(bucketId, next);
    }),
    toggle: vi.fn(async (id: string, bucketId = "first") => {
      const next = new Map(captures.get(bucketId));
      if (next.delete(id)) captures.set(bucketId, next);
      else await selection.select([id], bucketId);
    }),
  };
  const page = vi.fn(async (_index: number) => undefined);
  const view = renderHook((props) => useGridSelectionClick(props), {
    initialProps: { records, selection, page },
  });
  const ids = (bucket: string) =>
    [...(captures.get(bucket)?.keys() ?? [])].sort();
  return { ...view, records, selection, page, ids };
}

describe("bucket-aware grid ranges", () => {
  it("starts at the last selection, not the nearest selected tile", async () => {
    const { result, ids } = setup();
    await result.current("6", "first", false);
    await result.current("1", "first", false);
    await result.current("8", "first", true);
    expect(ids("first")).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });

  it("keeps independent anchors and preserves other buckets and unrelated selections", async () => {
    const { result, ids } = setup();
    await result.current("9", "first", false);
    await result.current("1", "first", false);
    await result.current("7", "second", false);
    await result.current("5", "third", false);
    await result.current("3", "first", true);
    await result.current("9", "second", true);
    await result.current("3", "third", true);
    expect(ids("first")).toEqual(["1", "2", "3", "9"]);
    expect(ids("second")).toEqual(["7", "8", "9"]);
    expect(ids("third")).toEqual(["3", "4", "5"]);
  });

  it("adds ranges backwards even when the endpoint is already selected", async () => {
    const { result, ids } = setup();
    await result.current("2", "first", false);
    await result.current("6", "first", false);
    await result.current("2", "first", true);
    expect(ids("first")).toEqual(["2", "3", "4", "5", "6"]);
    await result.current("0", "first", true);
    expect(ids("first")).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
  });

  it("selects only the endpoint without an anchor, including after a clear or deselection", async () => {
    const { result, selection, ids } = setup();
    await result.current("1", "first", true);
    expect(ids("first")).toEqual(["1"]);
    selection.captures.clear();
    await result.current("4", "first", true);
    expect(ids("first")).toEqual(["4"]);
    await result.current("4", "first", false);
    await result.current("8", "first", true);
    expect(ids("first")).toEqual(["8"]);
  });

  it("forgets anchors when the view or dataset changes", async () => {
    const { result, rerender, selection, records, page } = setup();
    await result.current("1", "first", false);
    rerender({
      records,
      selection: { ...selection, scopeKey: "filtered" },
      page,
    });
    await result.current("5", "first", true);
    expect(selection.select).toHaveBeenLastCalledWith(["5"], "first");
    rerender({ records, selection: { ...selection, domainId: "other" }, page });
    await result.current("8", "first", true);
    expect(selection.select).toHaveBeenLastCalledWith(["8"], "first");
  });

  it("loads missing pages so a range includes tiles skipped while scrolling", async () => {
    const { result, records, page, ids } = setup(42);
    for (let i = 20; i < 40; i++) records.delete(String(i));
    page.mockImplementation(async (index) => {
      for (let i = index * 20; i < (index + 1) * 20; i++)
        records.set(String(i), i);
    });
    await result.current("18", "first", false);
    await result.current("41", "first", true);
    expect(page).toHaveBeenCalledExactlyOnceWith(1);
    expect(ids("first")).toEqual(
      Array.from({ length: 24 }, (_, i) => String(i + 18)).sort(),
    );
  });

  it("does not select a partial range when a missing page cannot be loaded", async () => {
    const { result, records, ids } = setup();
    records.delete("3");
    await result.current("1", "first", false);
    await result.current("5", "first", true);
    expect(ids("first")).toEqual(["1"]);
  });

  it("drops a range lookup that finishes after the grid order changed", async () => {
    const { result, rerender, records, selection, page, ids } = setup();
    records.delete("3");
    let finish = () => undefined;
    page.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await result.current("1", "first", false);
    const pending = result.current("5", "first", true);
    rerender({ records: new Map(records), selection, page });
    records.set("3", 3);
    finish();
    await pending;
    expect(ids("first")).toEqual(["1"]);
  });
});
