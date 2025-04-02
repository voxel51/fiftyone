import { describe, expect, it } from "vitest";
import { handleNode } from "./utils";

const NODE = {
  __typename: "ImageSample" as const,
  aspectRatio: 1,
  id: "",
  sample: {},
  urls: [],
};

describe("spotlight paging", () => {
  it("handles object sample nodes", () => {
    expect(handleNode(NODE)).toStrictEqual(NODE);
  });

  it("handles string sample nodes", () => {
    expect(
      handleNode({
        ...NODE,
        sample: "{}" as unknown as Record<string, unknown>,
      })
    ).toStrictEqual(NODE);
  });
});
