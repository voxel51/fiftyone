/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import makeRoutes from "./makeRoutes";
import type { LocationState } from "./routing";

const datasetRoute = () => {
  const route = makeRoutes().find(({ path }) => path === "/datasets/:name");
  if (!route?.transform) {
    throw new Error("the dataset route has no transform");
  }

  return route.transform;
};

const VIEW = [{ _cls: "fiftyone.core.stages.Limit", kwargs: [["limit", 5]] }];

const FIELD_VISIBILITY = {
  cls: "fiftyone.core.stages.ExcludeFields",
  kwargs: { field_names: ["a"] },
};

const transform = (state: Partial<LocationState>) =>
  datasetRoute()(state as LocationState, { name: "my-dataset" });

describe("dataset route page query variables", () => {
  it("leaves the extended view as the view without a schema exclusion", () => {
    expect(transform({ view: VIEW }).extendedView).toEqual(VIEW);
    expect(transform({}).extendedView).toEqual([]);
  });

  it("appends the field visibility stage", () => {
    expect(
      transform({ view: VIEW, fieldVisibility: FIELD_VISIBILITY }).extendedView,
    ).toEqual([...VIEW, FIELD_VISIBILITY]);
  });

  it("appends the schema exclusion last, as a silent ExcludeFields", () => {
    expect(
      transform({
        view: VIEW,
        fieldVisibility: FIELD_VISIBILITY,
        schemaExclusion: ["secret"],
      }).extendedView,
    ).toEqual([
      ...VIEW,
      FIELD_VISIBILITY,
      {
        _cls: "fiftyone.core.stages.ExcludeFields",
        kwargs: { field_names: ["secret"], _allow_missing: true },
      },
    ]);
  });

  it("ignores an empty schema exclusion", () => {
    expect(transform({ view: VIEW, schemaExclusion: [] }).extendedView).toEqual(
      VIEW,
    );
  });

  it("does not mutate the view", () => {
    const view = [...VIEW];
    transform({ view, schemaExclusion: ["secret"] });
    expect(view).toEqual(VIEW);
  });

  it("requires a dataset name", () => {
    expect(() => datasetRoute()({} as LocationState, {})).toThrow(
      "dataset name not provided",
    );
  });
});
