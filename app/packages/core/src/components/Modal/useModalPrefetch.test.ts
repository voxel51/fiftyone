/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Peeked = { id: string; groupId?: string; sample: unknown };

type Fixture = {
  /** Accessor and raw Recoil values, by name. */
  values: Record<string, unknown>;
  navigation: { peek: (offset: number) => Promise<Peeked | null> } | null;
  environment: object;
  /** What the warm helpers were asked to do: "hold s3", "warm s4", ... */
  log: string[];
  /** Every params object passed to buildModalSampleVariables. */
  variables: unknown[];
};

// The hook reads its inputs through @fiftyone/state accessors, served from
// this per-test table, so no RecoilRoot is mounted. The warm helpers become
// recorders: their Relay behavior has its own tests in @fiftyone/state.
const fixture = vi.hoisted(
  (): Fixture => ({
    values: {},
    navigation: null,
    environment: {},
    log: [],
    variables: [],
  }),
);

vi.mock("@fiftyone/state", () => ({
  useModalSelector: () => fixture.values.modalSelector,
  useCurrentDatasetName: () => fixture.values.datasetName,
  useView: () => fixture.values.view,
  useSelectedMediaFieldModal: () => fixture.values.mediaField,
  useGridGroupSlice: () => fixture.values.slice,
  useModalGroupSlice: () => fixture.values.sliceSelect,
  useHasGroupSlices: () => fixture.values.hasGroupSlices,
  modalNavigation: { get: () => fixture.navigation },
  buildModalSampleVariables: (params: { id: string }) => {
    fixture.variables.push(params);
    return params;
  },
  retainModalSample: (_environment: unknown, variables: { id: string }) => {
    fixture.log.push(`hold ${variables.id}`);
    return {
      dispose: () => {
        fixture.log.push(`release ${variables.id}`);
      },
    };
  },
  warmModalSample: (_environment: unknown, variables: { id: string }) => {
    fixture.log.push(`warm ${variables.id}`);
    return {
      release: () => {
        fixture.log.push(`release ${variables.id}`);
      },
    };
  },
}));

vi.mock("react-relay", () => ({
  useRelayEnvironment: () => fixture.environment,
}));

import useModalPrefetch, {
  keyFor,
  reconcileWindow,
  SETTLE_MS,
} from "./useModalPrefetch";

describe("reconcileWindow", () => {
  const gen = "g";

  it("warms every neighbor on a fresh open, evicts nothing", () => {
    expect(
      reconcileWindow({
        currentId: "c",
        generation: gen,
        neighborIds: ["a", "b"],
        existingKeys: [],
      }),
    ).toEqual({
      toWarm: [
        { id: "a", key: keyFor(gen, "a") },
        { id: "b", key: keyFor(gen, "b") },
      ],
      toEvict: [],
    });
  });

  it("never warms the current sample", () => {
    const { toWarm } = reconcileWindow({
      currentId: "c",
      generation: gen,
      neighborIds: ["c", "a"],
      existingKeys: [],
    });
    expect(toWarm).toEqual([{ id: "a", key: keyFor(gen, "a") }]);
  });

  it("keeps the held current sample out of the evictions", () => {
    const { toWarm, toEvict } = reconcileWindow({
      currentId: "a",
      generation: gen,
      neighborIds: [],
      existingKeys: [keyFor(gen, "a")],
    });
    expect(toWarm).toEqual([]);
    expect(toEvict).toEqual([]);
  });

  it("skips already-warmed neighbors and dedupes repeated offsets", () => {
    const { toWarm } = reconcileWindow({
      currentId: "c",
      generation: gen,
      neighborIds: ["a", "a", "b"],
      existingKeys: [keyFor(gen, "b")],
    });
    // "a" appears once (dedupe); "b" is skipped (already warmed).
    expect(toWarm).toEqual([{ id: "a", key: keyFor(gen, "a") }]);
  });

  it("keeps current + window and evicts entries that left the window", () => {
    // Moved onto "a" (a former lookahead neighbor); "z" is now out of window.
    const { toWarm, toEvict } = reconcileWindow({
      currentId: "a",
      generation: gen,
      neighborIds: ["b", "x"],
      existingKeys: [keyFor(gen, "a"), keyFor(gen, "b"), keyFor(gen, "z")],
    });
    expect(toWarm).toEqual([{ id: "x", key: keyFor(gen, "x") }]);
    expect(toEvict).toEqual([keyFor(gen, "z")]);
  });

  it("evicts all prior-generation entries when the generation changes", () => {
    const { toWarm, toEvict } = reconcileWindow({
      currentId: "c",
      generation: "g2",
      neighborIds: ["a"],
      existingKeys: [keyFor("g1", "c"), keyFor("g1", "a")],
    });
    expect(toWarm).toEqual([{ id: "a", key: keyFor("g2", "a") }]);
    expect(toEvict).toEqual([keyFor("g1", "c"), keyFor("g1", "a")]);
  });
});

describe("useModalPrefetch", () => {
  const IDS = Array.from({ length: 10 }, (_, i) => `s${i}`);
  // The spotlight cursor's position: peeks are relative to it.
  let position = 0;

  const peek = async (offset: number): Promise<Peeked | null> => {
    const id = IDS[position + offset];
    return id ? { id, groupId: `g-${id}`, sample: {} } : null;
  };

  // Navigate the modal to IDS[index], as the debounced navigator would.
  const open = (index: number) => {
    position = index;
    fixture.values.modalSelector = {
      id: IDS[index],
      groupId: `g-${IDS[index]}`,
    };
  };

  // Advance fake time, then let the hook's sequential peeks resolve.
  const advance = async (ms: number) => {
    vi.advanceTimersByTime(ms);
    for (let i = 0; i < 50; i++) {
      await Promise.resolve();
    }
  };

  const logged = (kind: "hold" | "warm" | "release") =>
    fixture.log
      .filter((entry) => entry.startsWith(`${kind} `))
      .map((entry) => entry.slice(kind.length + 1));

  beforeEach(() => {
    vi.useFakeTimers();
    fixture.values = {
      datasetName: "ds",
      view: [],
      mediaField: "filepath",
      slice: null,
      sliceSelect: null,
      hasGroupSlices: false,
    };
    fixture.navigation = { peek };
    fixture.log.length = 0;
    fixture.variables.length = 0;
    open(3);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the current sample at once, then warms two ahead and one behind once navigation settles", async () => {
    renderHook(() => useModalPrefetch());
    expect(fixture.log).toEqual(["hold s3"]);
    await advance(SETTLE_MS - 1);
    expect(fixture.log).toEqual(["hold s3"]);

    await advance(1);
    expect(logged("warm")).toEqual(["s4", "s5", "s2"]);
    expect(logged("release")).toEqual([]);
  });

  it("warms one new sample per forward step and keeps the one just left", async () => {
    const { rerender } = renderHook(() => useModalPrefetch());
    await advance(SETTLE_MS);
    fixture.log.length = 0;

    open(4);
    rerender();
    await advance(SETTLE_MS);
    // s4 and s5 were already warm, and s3 (just left) stays as the
    // look-behind neighbor.
    expect(logged("hold")).toEqual([]);
    expect(logged("warm")).toEqual(["s6"]);
    expect(logged("release")).toEqual(["s2"]);
  });

  it("warms nothing while an arrow key is held, then keeps only the new window", async () => {
    const { rerender } = renderHook(() => useModalPrefetch());
    await advance(SETTLE_MS);
    fixture.log.length = 0;

    // One step per debounced navigation, each faster than the settle. The
    // samples passed through are held (no fetch), but nothing is warmed.
    for (const index of [4, 5, 6, 7]) {
      open(index);
      rerender();
      await advance(150);
    }
    expect(logged("hold")).toEqual(["s6", "s7"]);
    expect(logged("warm")).toEqual([]);
    expect(logged("release")).toEqual([]);

    await advance(SETTLE_MS);
    // s6, the sample just left, was held on the way through: no refetch.
    expect(logged("warm")).toEqual(["s8", "s9"]);
    expect(logged("release").sort()).toEqual(["s2", "s3", "s4", "s5"]);
  });

  it("re-warms under a new generation before releasing the old one", async () => {
    const { rerender } = renderHook(() => useModalPrefetch());
    await advance(SETTLE_MS);
    fixture.log.length = 0;

    fixture.values.mediaField = "thumbnail";
    rerender();
    await advance(SETTLE_MS);
    expect(logged("hold")).toEqual(["s3"]);
    expect(logged("warm")).toEqual(["s4", "s5", "s2"]);
    expect(logged("release").sort()).toEqual(["s2", "s3", "s4", "s5"]);
    // Nothing drops out of the store between the two generations: every
    // release comes after the last hold or warm.
    const releasesStart = fixture.log.findIndex((entry) =>
      entry.startsWith("release "),
    );
    const tail = fixture.log.slice(releasesStart);
    expect(releasesStart).toBeGreaterThan(0);
    expect(tail.every((entry) => entry.startsWith("release "))).toBe(true);
  });

  it("releases everything when the modal closes", async () => {
    const { rerender } = renderHook(() => useModalPrefetch());
    await advance(SETTLE_MS);

    fixture.values.modalSelector = null;
    rerender();
    expect(logged("release").sort()).toEqual(["s2", "s3", "s4", "s5"]);
  });

  it("releases everything on unmount", async () => {
    const { unmount } = renderHook(() => useModalPrefetch());
    await advance(SETTLE_MS);

    unmount();
    expect(logged("release").sort()).toEqual(["s2", "s3", "s4", "s5"]);
  });

  it("does nothing when the modal has no navigation to peek with", async () => {
    fixture.navigation = null;
    renderHook(() => useModalPrefetch());
    await advance(SETTLE_MS);
    expect(fixture.log).toEqual([]);
  });

  it("passes each sample's group id into its variables in a grouped dataset", async () => {
    Object.assign(fixture.values, {
      hasGroupSlices: true,
      slice: "left",
      sliceSelect: "right",
    });
    renderHook(() => useModalPrefetch());
    await advance(SETTLE_MS);

    expect(fixture.variables).toContainEqual({
      dataset: "ds",
      view: [],
      id: "s4",
      slice: "left",
      sliceSelect: "right",
      groupId: "g-s4",
    });
    expect(fixture.variables).toContainEqual(
      expect.objectContaining({ id: "s3", groupId: "g-s3" }),
    );
  });

  it("skips a grouped dataset until both slices are known, like modalSample", async () => {
    Object.assign(fixture.values, {
      hasGroupSlices: true,
      slice: "left",
      sliceSelect: null,
    });
    renderHook(() => useModalPrefetch());
    await advance(SETTLE_MS);
    expect(fixture.log).toEqual([]);
  });
});
