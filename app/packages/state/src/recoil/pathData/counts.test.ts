import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import {
  setMockAtoms,
  TestSelectorFamily,
} from "../../../../../__mocks__/recoil";
import * as counts from "./counts";

describe("resolves none counts", () => {
  const testNoneCount = <TestSelectorFamily<typeof counts.noneCount>>(
    (<unknown>counts.noneCount({
      extended: false,
      modal: false,
      path: "my_keypoints.keypoints.points",
    }))
  );

  setMockAtoms({
    aggregation: () => undefined,
    count: ({ path }) => {
      if (path !== "my_keypoints.keypoints") {
        throw new Error(`wrong path ${path}`);
      }
      return 1;
    },
    isListField: () => false,
  });

  it("resolves with undefined count", () => {
    expect(testNoneCount()).toBe(1);
  });
});
