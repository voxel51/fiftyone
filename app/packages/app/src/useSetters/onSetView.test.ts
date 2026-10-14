/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";

// The mutation completes at once, as when it lands mid-refresh
vi.mock("relay-runtime", () => ({
  commitMutation: (
    _: unknown,
    { onCompleted }: { onCompleted: (response: unknown) => void },
  ) => onCompleted({ setView: [] }),
}));
vi.mock("@fiftyone/relay", () => ({
  setView: {},
  subscribe: () => () => undefined,
}));
vi.mock("@fiftyone/state", () => ({
  DEFAULT_SELECTION_STYLE: "default",
  datasetName: "datasetName",
  resetExtendedSelectionTransaction: () => undefined,
  stateSubscription: "stateSubscription",
  view: "view",
  viewStateForm_INTERNAL: "viewStateForm",
}));
vi.mock("@fiftyone/view-bar", () => ({ rollbackViewBar: () => undefined }));
vi.mock("../Renderer", () => ({ pendingEntry: "pendingEntry" }));
vi.mock("../utils", () => ({ resolveURL: () => "/datasets/dataset" }));

import onSetView from "./onSetView";
import onSetViewName from "./onSetViewName";
import type { RegisteredSetter } from "./registerSetter";

const atoms: Record<string, unknown> = {
  datasetName: "dataset",
  stateSubscription: "subscription",
  view: [],
  viewStateForm: {},
};

const run = (setter: RegisteredSetter, value: unknown) => {
  const push = vi.fn();
  const router = {
    // a refresh is reloading the entry
    get: () => {
      throw new Error("entry is loading");
    },
    history: { location: { pathname: "/datasets/dataset" }, push },
    location: { search: "", state: { schemaExclusion: ["secret"] } },
  };
  setter({
    handleError: vi.fn(),
    router,
    sessionRef: { current: {} },
  } as unknown as Parameters<RegisteredSetter>[0])(
    {
      get: (atom: string) => atoms[atom],
      set: () => undefined,
    } as never,
    value,
  );
  return push;
};

describe("view changes that land during a refresh", () => {
  it("keep the schema exclusion when stages change", () => {
    expect(run(onSetView, [])).toHaveBeenCalledWith("/datasets/dataset", {
      view: [],
      schemaExclusion: ["secret"],
    });
  });

  it("keep the schema exclusion when a saved query loads", () => {
    expect(run(onSetViewName, "kept")).toHaveBeenCalledWith(
      "/datasets/dataset",
      { view: [], schemaExclusion: ["secret"] },
    );
  });
});
