/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const response = vi.hoisted(() => ({ savedView: [] as unknown[] }));

// The mutation completes at once, as when it lands mid-refresh
vi.mock("relay-runtime", () => ({
  commitMutation: (
    _: unknown,
    {
      onCompleted,
      variables,
    }: {
      onCompleted: (response: unknown) => void;
      variables: { view: unknown[]; savedViewSlug?: string };
    },
  ) =>
    onCompleted({
      setView: variables.savedViewSlug ? response.savedView : variables.view,
    }),
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

const run = (setter: RegisteredSetter, value: unknown, session = {}) => {
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
    sessionRef: { current: session },
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

afterEach(() => {
  atoms.view = [];
  response.savedView = [];
});

it.each([onSetView, onSetViewName])(
  "preserves captures for compatible view navigation",
  (setter) => {
    const selectedSamples = new Map([["sample", "default"]]);
    const session = { selectedSamples };
    run(setter, setter === onSetView ? [] : "saved-query", session);
    expect(session.selectedSamples).toBe(selectedSamples);
  },
);

it("resets legacy IDs when leaving a converted view", () => {
  atoms.view = [
    {
      _cls: "fiftyone.core.stages.ToPatches",
      kwargs: [["field", "predictions"]],
    },
  ];
  const session = { selectedSamples: new Map([["patch", "default"]]) };
  run(onSetView, [], session);
  expect(session.selectedSamples.size).toBe(0);
});

it("keeps captures when an ordinary stage changes within a converted view", () => {
  atoms.view = [
    {
      _cls: "fiftyone.core.stages.ToPatches",
      kwargs: [["field", "predictions"]],
    },
  ];
  const selectedSamples = new Map([["patch", "default"]]);
  const session = { selectedSamples };
  run(
    onSetView,
    [
      ...(atoms.view as unknown[]),
      { _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 1]] },
    ],
    session,
  );
  expect(session.selectedSamples).toBe(selectedSamples);
});

// History compares these stages on Back/Forward, including saved queries.
it("records the resolved conversion when loading a saved query", () => {
  const stages = [
    {
      _cls: "fiftyone.core.stages.ToPatches",
      kwargs: [["field", "predictions"]],
    },
  ];
  atoms.view = stages;
  response.savedView = stages;
  const selectedSamples = new Map([["patch", "default"]]);
  const session = { selectedSamples };
  expect(run(onSetViewName, "patches", session)).toHaveBeenCalledWith(
    "/datasets/dataset",
    { view: stages, schemaExclusion: ["secret"] },
  );
  expect(session.selectedSamples).toBe(selectedSamples);
});
