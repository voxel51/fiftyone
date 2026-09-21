import _ from "lodash";
import { describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/reverb");
vi.mock("@fiftyone/relay");

import {
  TestSelectorFamily,
  setMockAtoms,
} from "../../../reverb/src/__mocks__/index";
import * as options from "./options";
import { State } from "./types";

describe("Resolves media fields only if they exist", () => {
  it("grid media field is not 'filepath' if the media field atom value is a field path", () => {
    const test = <TestSelectorFamily<typeof options.selectedMediaField>>(
      (<unknown>options.selectedMediaField(false))
    );
    setMockAtoms({
      fieldPaths: (params) => {
        if (_.eq(params, { space: State.SPACE.SAMPLE })) {
          throw new Error("unexpected params");
        }

        return ["filepath", "thumbnail_path"];
      },
      selectedMediaFieldAtomFamily: () => "thumbnail_path",
    });

    expect(test()).toEqual("thumbnail_path");
  });

  it("grid media field is 'filepath' if the media field atom value is not a field path", () => {
    const test = <TestSelectorFamily<typeof options.selectedMediaField>>(
      (<unknown>options.selectedMediaField(false))
    );
    setMockAtoms({
      fieldPaths: (params) => {
        if (_.eq(params, { space: State.SPACE.SAMPLE })) {
          throw new Error("unexpected params");
        }

        return ["filepath"];
      },
      selectedMediaFieldAtomFamily: () => "thumbnail_path",
    });

    expect(test()).toEqual("filepath");
  });
});
