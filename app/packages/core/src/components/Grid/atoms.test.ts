import { atom, runTransaction, selectorFamily } from "@fiftyone/reverb";
import type { PageSubscription } from "@fiftyone/relay";
import { createStore } from "jotai";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const subscriptions = vi.hoisted(() => [] as PageSubscription<never>[]);

vi.mock("@fiftyone/relay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/relay")>()),
  subscribe: (subscription: PageSubscription<never>) => {
    subscriptions.push(subscription);
    return () => {};
  },
}));

vi.mock("@fiftyone/state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/state")>()),
  datasetId: atom<string | null>({ key: "test.datasetId", default: "a" }),
  groupSlice: atom<string | null>({ key: "test.groupSlice", default: null }),
  selectedMediaField: selectorFamily<string, boolean>({
    key: "test.selectedMediaField",
    get: () => () => "filepath",
  }),
}));

let loaded: Promise<{
  atoms: typeof import("./atoms");
  fos: typeof import("@fiftyone/state");
}>;
const load = () => {
  loaded ??= (async () => {
    const fos = await import("@fiftyone/state");
    // what the grid's atoms subscribe to, apart from the App's own state
    subscriptions.length = 0;
    return { atoms: await import("./atoms"), fos };
  })();
  return loaded;
};

// the App's state module is slow to import under a parallel run
beforeAll(load, 30_000);
beforeEach(() => localStorage.clear());

describe("recommendedGridZoom", () => {
  it("is remembered per dataset", async () => {
    const { atoms, fos } = await load();
    const visit = createStore();
    visit.sub(atoms.recommendedGridZoom, () => undefined);
    visit.set(atoms.recommendedGridZoom, -4);

    const next = createStore();
    next.sub(atoms.recommendedGridZoom, () => undefined);
    expect(next.get(atoms.recommendedGridZoom)).toBe(-4);

    next.set(fos.datasetId, "b");
    expect(next.get(atoms.recommendedGridZoom)).toBeNull();
    next.set(fos.datasetId, "a");
    expect(next.get(atoms.recommendedGridZoom)).toBe(-4);
  });

  it("is not reset by page changes", async () => {
    const { atoms } = await load();
    const store = createStore();
    store.sub(atoms.recommendedGridZoom, () => undefined);
    store.set(atoms.recommendedGridZoom, -4);

    for (const subscription of subscriptions) {
      runTransaction(store, (transaction) =>
        subscription(
          { event: undefined } as Parameters<typeof subscription>[0],
          transaction,
        ),
      );
    }
    expect(store.get(atoms.recommendedGridZoom)).toBe(-4);
  });
});
