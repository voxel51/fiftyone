import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useActiveSelectionBucket,
  useClearSelectionBucket,
  useEpisodeSelection,
  useEpisodeSelectionActions,
  useRefreshSelectionMetadata,
  useRemoveSelectionBucket,
  useSelectionBoundary,
  useOpenSelectionBoundary,
  useSelectionBucketActions,
  useSelectionBucketCaptures,
  useSelectionBucketCommands,
  useSelectionBuckets,
  useRestoreSelection,
  useSelectionMembership,
  useSelectionSections,
} from "./hooks";
import type { EpisodeSelection, SelectionMember } from "./types";

describe("dataset-isolated captures", () => {
  it("deselects removed members without clearing later captures or other segments", () => {
    const store = createStore();
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    );
    const { result } = renderHook(
      () => ({
        selected: useEpisodeSelection("removal"),
        actions: useEpisodeSelectionActions("removal"),
        other: useEpisodeSelection("other-removal"),
        otherActions: useEpisodeSelectionActions("other-removal"),
      }),
      { wrapper },
    );
    const segment = (start: string, end: string): SelectionMember => ({
      episodeId: "one",
      kind: "segment",
      range: {
        start,
        end,
        timebase: "sequence",
        streams: ["filepath"],
        provenance: [],
      },
    });
    const original = segment("10", "20");
    const later = segment("20", "30");
    const whole = { episodeId: "two", kind: "episode" as const };
    act(() => {
      result.current.actions.capture({ episodeId: "one", members: [original] });
      result.current.actions.capture({ episodeId: "two", members: [whole] });
      result.current.otherActions.capture({
        episodeId: "two",
        members: [whole],
      });
    });
    act(() =>
      result.current.actions.capture(
        { episodeId: "one", members: [later] },
        "add",
      ),
    );
    act(() => result.current.actions.removeMembers([original, whole]));
    expect([...result.current.selected.keys()]).toEqual(["one"]);
    expect(result.current.selected.get("one")?.members).toEqual([later]);
    expect(result.current.other.size).toBe(1);
    act(() => result.current.actions.removeMembers([later]));
    expect(result.current.selected.size).toBe(0);
    expect(
      sessionStorage.getItem("fiftyone:grid-selection:removal"),
    ).toBeNull();
  });

  it("retains captures across providers and subset changes without leaking datasets", () => {
    const store = createStore();
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    );
    const { result, rerender } = renderHook(
      ({ dataset }) => ({
        selected: useEpisodeSelection(dataset),
        actions: useEpisodeSelectionActions(dataset),
        boundary: useSelectionBoundary(dataset),
        open: useOpenSelectionBoundary(),
      }),
      { initialProps: { dataset: "a" }, wrapper },
    );
    act(() =>
      result.current.actions.capture({
        episodeId: "one",
        members: [{ episodeId: "one", kind: "episode" }],
      }),
    );
    act(() =>
      result.current.open("a", {
        subsetId: "different",
        provider: { kind: "temporal-tags", values: ["review"] },
      }),
    );
    expect(result.current.selected.size).toBe(1);
    rerender({ dataset: "b" });
    expect(result.current.selected.size).toBe(0);
    rerender({ dataset: "a" });
    expect(result.current.selected.size).toBe(1);
    act(() => result.current.actions.clear());
    expect(result.current.selected.size).toBe(0);
    expect(result.current.boundary[0].subsetId).toBe("different");
  });
});

describe("session persistence", () => {
  it("restores captures for a dataset from session storage and clears them on empty", () => {
    const group = {
      episodeId: "persisted",
      members: [{ episodeId: "persisted", kind: "episode" as const }],
    };
    sessionStorage.setItem(
      "fiftyone:grid-selection:seeded",
      JSON.stringify([group, { junk: true }]),
    );
    const store = createStore();
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    );
    const { result } = renderHook(
      () => ({
        selected: useEpisodeSelection("seeded"),
        actions: useEpisodeSelectionActions("seeded"),
      }),
      { wrapper },
    );
    expect([...result.current.selected.keys()]).toEqual(["persisted"]);
    act(() =>
      result.current.actions.capture({
        episodeId: "second",
        members: [{ episodeId: "second", kind: "episode" }],
        node: {
          id: "second",
          sample: { _id: "second", cameras: { _cls: "Group", name: "left" } },
          urls: [{ field: "filepath", url: "https://media.example/signed" }],
        },
      }),
    );
    expect(
      JSON.parse(
        sessionStorage.getItem("fiftyone:grid-selection:seeded") ?? "[]",
      )
        .map((entry: { episodeId: string }) => entry.episodeId)
        .sort(),
    ).toEqual(["persisted", "second"]);
    const saved: EpisodeSelection[] = JSON.parse(
      sessionStorage.getItem("fiftyone:grid-selection:seeded") ?? "[]",
    );
    expect(saved.find((capture) => capture.episodeId === "second")).toEqual({
      episodeId: "second",
      members: [{ episodeId: "second", kind: "episode" }],
      groupSlice: "left",
    });
    act(() => result.current.actions.clear());
    expect(sessionStorage.getItem("fiftyone:grid-selection:seeded")).toBeNull();
  });
});

describe("selection buckets", () => {
  const whole = (id: string): EpisodeSelection => ({
    episodeId: id,
    members: [{ episodeId: id, kind: "episode" }],
  });
  function harness(dataset: string, domain = dataset) {
    const store = createStore();
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    );
    return renderHook(
      () => {
        const buckets = useSelectionBuckets(dataset);
        return {
          buckets,
          layout: useSelectionBucketActions(dataset),
          captures: useSelectionBucketCaptures(domain),
          membership: useSelectionMembership(domain),
          active: useActiveSelectionBucket(domain),
          sections: useSelectionSections(domain),
          restore: useRestoreSelection(domain),
          commands: useSelectionBucketCommands(domain),
          clearBucket: useClearSelectionBucket(domain),
          removeBucket: useRemoveSelectionBucket(domain),
          refresh: useRefreshSelectionMetadata(domain),
          primary: useEpisodeSelectionActions(domain),
          second: useEpisodeSelectionActions(domain, buckets[1]?.id ?? "none"),
          third: useEpisodeSelectionActions(domain, buckets[2]?.id ?? "none"),
        };
      },
      { wrapper },
    );
  }

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("starts as the single tray and opts in by adding buckets, at most three", () => {
    const { result } = harness("layout");
    expect(result.current.buckets).toEqual([{ id: "primary" }]);
    expect(localStorage.getItem("fiftyone:grid-selection-buckets:layout")).toBe(
      null,
    );
    let second = "";
    act(() => {
      second = result.current.layout.add() ?? "";
    });
    expect(second).toMatch(/^b/);
    act(() => {
      result.current.layout.add();
    });
    expect(result.current.buckets).toHaveLength(3);
    let fourth: string | null = "unset";
    act(() => {
      fourth = result.current.layout.add();
    });
    expect(fourth).toBeNull();
    expect(result.current.buckets).toHaveLength(3);
    act(() =>
      result.current.layout.update(second, {
        name: "  Needs review before the next export  ",
      }),
    );
    expect(result.current.buckets[1]).toEqual({
      id: second,
      name: "Needs review before the",
    });
    act(() => result.current.layout.update(second, { icon: "thumbsDown" }));
    expect(result.current.buckets[1].icon).toBe("thumbsDown");
    act(() => result.current.layout.update(second, { name: "" }));
    expect(result.current.buckets[1]).toEqual({
      id: second,
      icon: "thumbsDown",
    });
    expect(
      JSON.parse(
        localStorage.getItem("fiftyone:grid-selection-buckets:layout") ?? "[]",
      ),
    ).toHaveLength(3);
  });

  it("keeps buckets independent: a parent may sit in all three and leave one at a time", () => {
    const { result } = harness("independent");
    act(() => {
      result.current.layout.add();
      result.current.layout.add();
    });
    const [first, second, third] = result.current.buckets.map((b) => b.id);
    act(() => {
      result.current.primary.capture(whole("shared"));
      result.current.second.capture(whole("shared"));
      result.current.third.capture(whole("shared"));
      result.current.second.capture(whole("only-second"));
    });
    expect(result.current.membership.get("shared")).toEqual([
      first,
      second,
      third,
    ]);
    expect(result.current.membership.get("only-second")).toEqual([second]);
    act(() => result.current.second.remove("shared"));
    expect(result.current.captures.get(first)?.has("shared")).toBe(true);
    expect(result.current.captures.get(second)?.has("shared")).toBe(false);
    expect(result.current.captures.get(third)?.has("shared")).toBe(true);
    expect(result.current.captures.get(second)?.has("only-second")).toBe(true);
    act(() => result.current.clearBucket(third));
    expect(result.current.captures.get(third)?.size).toBe(0);
    expect(result.current.captures.get(first)?.size).toBe(1);
    expect(result.current.captures.get(second)?.size).toBe(1);
    // The primary bucket keeps the single tray's storage key; others append theirs.
    expect(
      sessionStorage.getItem("fiftyone:grid-selection:independent"),
    ).toContain("shared");
    expect(
      sessionStorage.getItem(`fiftyone:grid-selection:independent#${second}`),
    ).toContain("only-second");
  });

  it("clears one bucket without touching the others, and clears everything on demand", () => {
    const { result } = harness("clearing");
    act(() => {
      result.current.layout.add();
    });
    const [first, second] = result.current.buckets.map((b) => b.id);
    act(() => {
      result.current.primary.capture(whole("a"));
      result.current.primary.capture(whole("b"));
    });
    act(() => {
      result.current.clearBucket(second);
    });
    expect(result.current.captures.get(first)?.size).toBe(2);
    act(() => {
      result.current.commands.removeEverywhere("a");
    });
    expect([...result.current.captures.get(first)!.keys()]).toEqual(["b"]);
    act(() => {
      result.current.commands.clearAll();
    });
    expect(result.current.captures.get(first)?.size).toBe(0);
    expect(sessionStorage.getItem("fiftyone:grid-selection:clearing")).toBe(
      null,
    );
  });

  it("splits with the first section active, which keeps what was picked", () => {
    const { result } = harness("active");
    act(() => {
      result.current.primary.capture(whole("a"));
    });
    act(() => result.current.sections.split());
    const [first, second] = result.current.buckets.map((b) => b.id);
    expect(result.current.active.active).toBe(first);
    expect(result.current.captures.get(first)?.has("a")).toBe(true);
    act(() => result.current.active.activate(second));
    expect(result.current.active.active).toBe(second);
    // pressing the active section again keeps it active
    act(() => result.current.active.activate(second));
    expect(result.current.active.active).toBe(second);
  });

  it("finds a section by position, making those up to it", () => {
    const { result } = harness("at");
    let third: string | null = null;
    act(() => {
      third = result.current.sections.sectionAt(2);
    });
    const ids = result.current.buckets.map((b) => b.id);
    expect(ids).toHaveLength(3);
    expect(third).toBe(ids[2]);
    expect(result.current.sections.sectionAt(0)).toBe("primary");
    // no fourth section
    act(() => {
      expect(result.current.sections.sectionAt(3)).toBeNull();
    });
    expect(result.current.buckets).toHaveLength(3);
  });

  it("moves a pick between sections, or copies it, in one change", () => {
    const { result } = harness("move");
    act(() => {
      result.current.primary.capture(whole("a"));
      result.current.primary.capture(whole("b"));
    });
    act(() => result.current.sections.split());
    const [first, second] = result.current.buckets.map((b) => b.id);
    const keys = (id: string) => [
      ...(result.current.captures.get(id)?.keys() ?? []),
    ];
    act(() => result.current.sections.move("a", first, second));
    expect(keys(first)).toEqual(["b"]);
    expect(keys(second)).toEqual(["a"]);
    act(() => result.current.sections.move("b", first, second, true));
    expect(keys(first)).toEqual(["b"]);
    expect(keys(second)).toEqual(["a", "b"]);
    // a parent the section does not hold moves nowhere
    act(() => result.current.sections.move("gone", first, second));
    expect(keys(second)).toEqual(["a", "b"]);
  });

  it("merges sections back into one strip, keeping every pick", () => {
    const { result } = harness("merge");
    act(() => {
      result.current.primary.capture(whole("a"));
    });
    act(() => result.current.sections.split());
    act(() => {
      result.current.second.capture(whole("b"));
    });
    act(() => result.current.sections.mergeAll());
    expect(result.current.buckets).toEqual([{ id: "primary" }]);
    expect([...(result.current.captures.get("primary")?.keys() ?? [])]).toEqual(
      ["a", "b"],
    );
    expect(result.current.active.active).toBe("primary");
  });

  it("folds one section into a neighbor, which takes over as active", () => {
    const { result } = harness("merge-one");
    act(() => {
      result.current.primary.capture(whole("a"));
    });
    act(() => result.current.sections.split());
    act(() => result.current.sections.add());
    const [first, second, third] = result.current.buckets.map((b) => b.id);
    act(() => {
      result.current.second.capture(whole("b"));
      result.current.third.capture(whole("a"));
    });
    act(() => result.current.active.activate(second));
    act(() => result.current.sections.mergeInto(second, third));
    expect(result.current.buckets.map((b) => b.id)).toEqual([first, third]);
    expect([...(result.current.captures.get(third)?.keys() ?? [])]).toEqual([
      "a",
      "b",
    ]);
    expect(result.current.active.active).toBe(third);
    // merging the last pair back leaves one plain strip
    act(() => result.current.sections.mergeInto(third, first));
    expect(result.current.buckets.map((b) => b.id)).toEqual([first]);
    expect([...(result.current.captures.get(first)?.keys() ?? [])]).toEqual([
      "a",
      "b",
    ]);
    expect(result.current.active.active).toBe(first);
  });

  it("drops a section, the first taking over when it was active", () => {
    const { result } = harness("drop");
    act(() => result.current.sections.split());
    act(() => result.current.sections.add());
    const [first, second, third] = result.current.buckets.map((b) => b.id);
    act(() => result.current.active.activate(third));
    act(() => result.current.sections.remove(third));
    expect(result.current.active.active).toBe(first);
    act(() => result.current.sections.remove(second));
    expect(result.current.buckets).toEqual([{ id: first }]);
    expect(result.current.active.active).toBe(first);
  });

  it("restores sections, captures, and the active section from a snapshot", () => {
    const { result } = harness("restore-all");
    act(() => {
      result.current.primary.capture(whole("a"));
    });
    const before = {
      buckets: result.current.buckets,
      captures: result.current.captures,
      active: result.current.active.active,
    };
    act(() => result.current.sections.split());
    act(() => {
      result.current.second.capture(whole("b"));
    });
    act(() => result.current.restore(before));
    expect(result.current.buckets).toEqual([{ id: "primary" }]);
    expect([...(result.current.captures.get("primary")?.keys() ?? [])]).toEqual(
      ["a"],
    );
    expect(result.current.active.active).toBe("primary");
  });

  it("removes a bucket with its captures from this domain and the samples view", () => {
    const { result } = harness("removal-ds", "removal-ds|patches");
    act(() => {
      result.current.layout.add();
    });
    const second = result.current.buckets[1].id;
    sessionStorage.setItem(
      `fiftyone:grid-selection:removal-ds#${second}`,
      JSON.stringify([whole("persisted")]),
    );
    act(() => result.current.removeBucket(second));
    expect(result.current.buckets).toEqual([{ id: "primary" }]);
    expect(result.current.captures.has(second)).toBe(false);
    expect(
      sessionStorage.getItem(`fiftyone:grid-selection:removal-ds#${second}`),
    ).toBeNull();
    // The last bucket can never be removed.
    act(() => result.current.removeBucket("primary"));
    expect(result.current.buckets).toEqual([{ id: "primary" }]);
  });

  it("gives a copy in another bucket the metadata the first copy already has", () => {
    const { result } = harness("inherit");
    act(() => {
      result.current.layout.add();
    });
    act(() => {
      result.current.primary.capture(whole("a"));
    });
    act(() =>
      result.current.refresh({
        a: { filepath: "/a.png", aspectRatio: 2, crop: [0.1, 0.2, 0.3, 0.4] },
      }),
    );
    act(() => {
      result.current.second.capture(whole("a"));
    });
    const second = result.current.buckets[1].id;
    expect(result.current.captures.get(second)?.get("a")).toMatchObject({
      filepath: "/a.png",
      aspectRatio: 2,
      crop: [0.1, 0.2, 0.3, 0.4],
      members: [{ episodeId: "a", kind: "episode" }],
    });
    // Metadata never travels the other way onto an unrelated parent.
    act(() => {
      result.current.second.capture(whole("b"));
    });
    expect(
      result.current.captures.get(second)?.get("b")?.filepath,
    ).toBeUndefined();
  });

  it.each([{}, { filepath: "/a.png" }])(
    "copies a persisted slice into another bucket without replacing supplied metadata: %j",
    (metadata) => {
      sessionStorage.setItem(
        "fiftyone:grid-selection:inherit-slice",
        JSON.stringify([{ ...whole("a"), groupSlice: "left" }]),
      );
      const { result } = harness("inherit-slice");
      act(() => result.current.layout.add());
      act(() => result.current.second.capture({ ...whole("a"), ...metadata }));
      const second = result.current.buckets[1].id;
      expect(result.current.captures.get(second)?.get("a")).toEqual({
        ...whole("a"),
        ...metadata,
        groupSlice: "left",
      });
      act(() =>
        result.current.second.capture({
          ...whole("a"),
          ...metadata,
          groupSlice: "right",
        }),
      );
      expect(result.current.captures.get(second)?.get("a")?.groupSlice).toBe(
        "right",
      );
    },
  );

  it("preserves an explicit slice when inheriting a known preview", () => {
    sessionStorage.setItem(
      "fiftyone:grid-selection:explicit-slice",
      JSON.stringify([
        { ...whole("a"), filepath: "/a.png", groupSlice: "left" },
      ]),
    );
    const { result } = harness("explicit-slice");
    act(() => result.current.layout.add());
    act(() =>
      result.current.second.capture({ ...whole("a"), groupSlice: "right" }),
    );
    expect(
      result.current.captures.get(result.current.buckets[1].id)?.get("a"),
    ).toMatchObject({ filepath: "/a.png", groupSlice: "right" });
  });

  it.each([true, false])(
    "inherits a slice and preview from different sections, slice first: %s",
    (sliceFirst) => {
      const { result } = harness("combined-metadata");
      act(() => result.current.layout.add());
      act(() => result.current.layout.add());
      act(() =>
        result.current.primary.capture({
          ...whole("a"),
          ...(sliceFirst ? { groupSlice: "left" } : { filepath: "/a.png" }),
        }),
      );
      act(() =>
        result.current.second.capture({
          ...whole("a"),
          ...(sliceFirst ? { filepath: "/a.png" } : { groupSlice: "left" }),
        }),
      );
      act(() => result.current.third.capture(whole("a")));
      expect(
        result.current.captures.get(result.current.buckets[2].id)?.get("a"),
      ).toMatchObject({ filepath: "/a.png", groupSlice: "left" });
    },
  );

  it("refreshes metadata in every bucket that holds the parent", () => {
    const { result } = harness("metadata");
    act(() => {
      result.current.primary.capture(whole("a"));
    });
    act(() =>
      result.current.refresh({ a: { filepath: "/a.mp4", unavailable: true } }),
    );
    expect(result.current.captures.get("primary")?.get("a")).toMatchObject({
      filepath: "/a.mp4",
      unavailable: true,
      members: [{ episodeId: "a", kind: "episode" }],
    });
  });

  it("isolates layouts per dataset", () => {
    const a = harness("iso-a");
    act(() => {
      a.result.current.layout.add();
    });
    const b = harness("iso-b");
    expect(b.result.current.buckets).toEqual([{ id: "primary" }]);
    expect(a.result.current.buckets).toHaveLength(2);
  });
});
