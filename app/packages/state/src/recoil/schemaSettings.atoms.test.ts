import * as fos from "@fiftyone/state";
import { describe, expect, it } from "vitest";
import { snapshot_UNSTABLE } from "../../../../__mocks__/recoil";
import * as ss from "./schemaSettings.atoms";

const TEST_DS = { name: "test-dataset", mediaType: "image" };

const initialize = ({ set }) => {
  set(fos.dataset, TEST_DS as fos.State.Dataset);
};

describe("excludedPathsState", () => {
  it("defaults to an empty set without a field visibility stage", () => {
    const snapshot = snapshot_UNSTABLE(initialize);

    const contents = snapshot.getLoadable(ss.excludedPathsState({})).contents;

    expect(contents[TEST_DS.name]).toEqual(new Set());
  });

  it("reset returns to the derived default", () => {
    const set = snapshot_UNSTABLE(initialize).map(({ set }) =>
      set(ss.excludedPathsState({}), {
        [TEST_DS.name]: new Set(["metadata"]),
      }),
    );
    expect(
      set.getLoadable(ss.excludedPathsState({})).contents[TEST_DS.name],
    ).toEqual(new Set(["metadata"]));

    const reset = set.map(({ reset }) => reset(ss.excludedPathsState({})));
    expect(
      reset.getLoadable(ss.excludedPathsState({})).contents[TEST_DS.name],
    ).toEqual(new Set());
  });
});
