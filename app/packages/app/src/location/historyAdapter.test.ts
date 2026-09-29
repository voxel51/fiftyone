/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { AdapterHarness } from "@fiftyone/location/src/testing";
import { CONFORMANCE_CASES } from "@fiftyone/location/src/testing";
import { createMemoryHistory } from "history";
import { describe, expect, it } from "vitest";
import { LOCATION_WRITE } from "../routing/RouterContext";
import { historyAdapter } from "./historyAdapter";

const harness = (): AdapterHarness => {
  const history = createMemoryHistory();
  return {
    adapter: historyAdapter(history),
    back: () => history.back(),
    depth: () => history.index + 1,
  };
};

// A notebook runs on exactly this history, so the suite covers that path too.
describe("historyAdapter conformance", () => {
  for (const { name, run } of CONFORMANCE_CASES) {
    it(name, () => run(harness()));
  }
});

describe("proxy prefix", () => {
  it("is stripped on read so no route sees it", () => {
    const history = createMemoryHistory({
      initialEntries: ["/foo/datasets/quickstart?proxy=%2Ffoo"],
    });
    expect(historyAdapter(history).get()).toBe(
      "/datasets/quickstart?proxy=%2Ffoo",
    );
  });

  it("is restored on write", () => {
    const history = createMemoryHistory({
      initialEntries: ["/foo/datasets/quickstart?proxy=%2Ffoo"],
    });
    historyAdapter(history).push("/datasets/other?proxy=%2Ffoo");
    expect(history.location.pathname).toBe("/foo/datasets/other");
  });

  it("is absent without the param, as in a notebook", () => {
    const history = createMemoryHistory({
      initialEntries: ["/datasets/quickstart"],
    });
    const adapter = historyAdapter(history);
    expect(adapter.get()).toBe("/datasets/quickstart");
    adapter.push("/datasets/other");
    expect(history.location.pathname).toBe("/datasets/other");
  });
});

describe("entry state", () => {
  it("carries the entry's state forward and marks the write", () => {
    const history = createMemoryHistory({
      initialEntries: [
        {
          pathname: "/datasets/quickstart",
          state: { view: [{ _cls: "Limit" }] },
        },
      ],
    });

    historyAdapter(history).replace("/datasets/quickstart?slice=left");

    expect(history.location.state).toEqual({
      view: [{ _cls: "Limit" }],
      [LOCATION_WRITE]: true,
    });
  });
});
