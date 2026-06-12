import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("recoil", () => ({
  // useRecoilCallback(factory, deps) → the callback, with a no-op `set`
  useRecoilCallback: (factory: (iface: { set: () => void }) => unknown) =>
    factory({ set: vi.fn() }),
}));

vi.mock("react-relay", () => ({
  useRelayEnvironment: () => ({}),
  commitLocalUpdate: (_env: unknown, updater: (store: unknown) => void) => {
    updater(mockStore);
  },
}));

vi.mock("./useLookerStore", () => ({
  stores: new Set(),
}));

vi.mock("../recoil/modal", () => ({
  localSampleVersion: (id: string) => ({ key: `localSampleVersion__${id}` }),
}));

import { useUpdateSamples } from "./useUpdateSamples";
import { stores } from "./useLookerStore";
import {
  consumeExternalSampleChange,
  deleteLocalSample,
  getLocalSample,
} from "../stores/sampleStore";

let storeRecords: Record<string, any>;
let deletedIds: string[];

const mockStore = {
  get: (id: string) => storeRecords[id] ?? null,
  delete: (id: string) => {
    deletedIds.push(id);
    delete storeRecords[id];
  },
};

const createMockRecord = () => ({
  setValue: vi.fn(),
});

describe("useUpdateSamples", () => {
  beforeEach(() => {
    storeRecords = {};
    deletedIds = [];
    stores.clear();
    for (const id of ["sample-1", "s1", "patch-label-id", "source-1"]) {
      deleteLocalSample(id);
    }
  });

  it("updates Relay store records for the sample and its modal variant", () => {
    const record = createMockRecord();
    const modalRecord = createMockRecord();
    storeRecords["sample-1"] = record;
    storeRecords["sample-1-modal"] = modalRecord;

    const updateSamples = useUpdateSamples();
    const sample = { _id: "sample-1", filepath: "/img.png" };
    updateSamples([["sample-1", sample as any]]);

    expect(record.setValue).toHaveBeenCalledWith(
      JSON.stringify(sample),
      "sample"
    );
    expect(modalRecord.setValue).toHaveBeenCalledWith(
      JSON.stringify(sample),
      "sample"
    );
  });

  it("writes the canonical local copy, marked external by default", () => {
    const updateSamples = useUpdateSamples();
    const sample = { _id: "sample-1", filepath: "/img.png" };
    updateSamples([["sample-1", sample as any]]);

    expect(getLocalSample("sample-1")).toBe(sample);
    expect(consumeExternalSampleChange("sample-1")).toBe(true);
    // consuming clears the flag
    expect(consumeExternalSampleChange("sample-1")).toBe(false);
  });

  it("does not flag editor write-throughs as external changes", () => {
    const updateSamples = useUpdateSamples();
    const sample = { _id: "sample-1", filepath: "/img.png" };
    updateSamples([["sample-1", sample as any]], { source: "editor" });

    expect(getLocalSample("sample-1")).toBe(sample);
    expect(consumeExternalSampleChange("sample-1")).toBe(false);
  });

  it("deletes the source sample modal record for generated view samples", () => {
    const patchRecord = createMockRecord();
    storeRecords["patch-label-id"] = patchRecord;
    storeRecords["source-1-modal"] = createMockRecord();

    const updateSamples = useUpdateSamples();
    const patchSample = {
      _id: "patch-label-id",
      _sample_id: "source-1",
      filepath: "/patch.png",
    };
    updateSamples([["patch-label-id", patchSample as any]]);

    expect(deletedIds).toContain("source-1-modal");
    expect(storeRecords["source-1-modal"]).toBeUndefined();
  });

  it("does not delete any records for non-generated samples", () => {
    storeRecords["sample-1"] = createMockRecord();

    const updateSamples = useUpdateSamples();
    const sample = { _id: "sample-1", filepath: "/img.png" };
    updateSamples([["sample-1", sample as any]]);

    expect(deletedIds).toHaveLength(0);
  });

  it("drives every registered sample store for the updated sample", () => {
    const updateSample = vi.fn();
    stores.add({ updateSample });

    const updateSamples = useUpdateSamples();
    const newSample = { _id: "s1", filepath: "/new.png" };
    updateSamples([["s1", newSample as any]]);

    expect(updateSample).toHaveBeenCalledWith("s1", newSample);
  });
});
