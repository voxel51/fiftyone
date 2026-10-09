import { atom, selector, snapshot_UNSTABLE } from "recoil";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentSampleId: undefined as unknown }));

vi.mock("@fiftyone/state", () => mocks);
vi.mock("./labelResolution", () => ({ clearLastCreatedLabels: vi.fn() }));

const pending = new Promise<string>(() => {});
const loadedSampleId = atom<string | null>({
  key: "working-test-loadedSampleId",
  default: null,
});
const waitingForSample = atom({
  key: "working-test-waitingForSample",
  default: false,
});
mocks.currentSampleId = selector<string | null>({
  key: "working-test-currentSampleId",
  get: ({ get }) => (get(waitingForSample) ? pending : get(loadedSampleId)),
});

const { workingAtom, workingAtomFamily } = await import("./working");

const seeded = {
  doc: { labelsById: {} },
  initialized: true,
};

describe("workingAtom", () => {
  it("holds the default state while the current sample id loads", () => {
    const loadable = snapshot_UNSTABLE(({ set }) =>
      set(waitingForSample, true),
    ).getLoadable(workingAtom);

    expect(loadable.state).toBe("hasValue");
    expect(loadable.contents).toEqual({
      doc: { labelsById: {} },
      initialized: false,
    });
  });

  it("keys by the current sample id once it has loaded", () => {
    const loadable = snapshot_UNSTABLE(({ set }) => {
      set(loadedSampleId, "sample-1");
      set(workingAtomFamily("sample-1"), seeded);
    }).getLoadable(workingAtom);

    expect(loadable.contents).toEqual(seeded);
  });
});
