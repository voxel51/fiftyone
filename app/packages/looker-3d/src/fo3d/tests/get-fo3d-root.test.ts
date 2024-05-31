import { describe, expect, it } from "vitest";
import { getFo3dRoot } from "../utils";

describe("getFo3dRoot", () => {
  it("should extract the root of a valid fo3d file", () => {
    const url = "/Users/johndoe/fiftyone/store/assets/file.fo3d";
    const expectedRoot = "/Users/johndoe/fiftyone/store/assets/";
    expect(getFo3dRoot(url)).toBe(expectedRoot);
  });

  it("should work with s3 urls with filepath", () => {
    const url = "s3://bucket/path/to/file/file.fo3d";
    const expectedRoot = "s3://bucket/path/to/file/";
    expect(getFo3dRoot(url)).toBe(expectedRoot);
  });
});
