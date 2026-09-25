import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useClearSelectionBucket,
  useEpisodeSelection,
  useEpisodeSelectionActions,
  useRefreshSelectionMetadata,
  useRemoveSelectionBucket,
  useSelectionBoundary,
  useSelectionBucketActions,
  useSelectionBucketCaptures,
  useSelectionBucketCommands,
  useSelectionBuckets,
  useSelectionMembership,
  useSelectionTarget,
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
      result.current.boundary[1]({
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
      }),
    );
    expect(
      JSON.parse(
        sessionStorage.getItem("fiftyone:grid-selection:seeded") ?? "[]",
      )
        .map((entry: { episodeId: string }) => entry.episodeId)
        .sort(),
    ).toEqual(["persisted", "second"]);
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
          target: useSelectionTarget(domain),
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
      result.current.layout.update(second, { name: "  Needs review  " }),
    );
    expect(result.current.buckets[1]).toEqual({
      id: second,
      name: "Needs revi",
    });
    act(() => result.current.layout.update(second, { icon: "reject" }));
    expect(result.current.buckets[1].icon).toBe("reject");
    act(() => result.current.layout.update(second, { name: "" }));
    expect(result.current.buckets[1]).toEqual({ id: second, icon: "reject" });
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

  it("targets the chosen bucket while it has captures, else the first populated one", () => {
    const { result } = harness("target");
    act(() => {
      result.current.layout.add();
    });
    const [first, second] = result.current.buckets.map((b) => b.id);
    expect(result.current.target.target).toBe(first);
    act(() => result.current.target.setTarget(second));
    // An empty choice is remembered but yields to a populated bucket.
    expect(result.current.target.target).toBe(second);
    act(() => {
      result.current.primary.capture(whole("a"));
    });
    expect(result.current.target.target).toBe(first);
    act(() => {
      result.current.primary.clear();
    });
    expect(result.current.target.target).toBe(second);
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

  it("restores a removed bucket at its old position", () => {
    const { result } = harness("restore");
    act(() => {
      result.current.layout.add();
      result.current.layout.add();
    });
    const middle = result.current.buckets[1];
    act(() => result.current.layout.update(middle.id, { name: "Mid" }));
    const named = result.current.buckets[1];
    act(() => result.current.layout.remove(middle.id));
    expect(result.current.buckets).toHaveLength(2);
    act(() => result.current.layout.restore(named, 1));
    expect(result.current.buckets[1]).toEqual({ id: middle.id, name: "Mid" });
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
