import { describe, expect, it } from "vitest";
import { getFo3dRoot } from "../utils";

describe("getFo3dRoot", () => {
  it("should extract the root of a valid fo3d file URL", () => {
    const url =
      "http://localhost:5151/media?filepath=%2FUsers%2Fjohndoe%2Ffiftyone%2Fstore%2Fassets%2Ffo_cloud.fo3d";
    const expectedRoot = "/Users/johndoe/fiftyone/store/assets/";
    expect(getFo3dRoot(url)).toBe(expectedRoot);
  });

  it("should throw an error if the URL does not contain a filepath", () => {
    const url = "http://localhost:5151/media";
    expect(() => getFo3dRoot(url)).toThrow("Filepath not found in URL");
  });

  it("should handle URLs with different file structures", () => {
    const url =
      "http://example.com/media?filepath=%2Fpath%2Fto%2Ffile%2Fexample.fo3d";
    const expectedRoot = "/path/to/file/";
    expect(getFo3dRoot(url)).toBe(expectedRoot);
  });

  it("should work with s3 urls", () => {
    const url =
      "http://example.com/media?filepath=s3%3A%2F%2Fbucket%2Fpath%2Fto%2Ffile%2Fexample.fo3d";
    const expectedRoot = "s3://bucket/path/to/file/";
    expect(getFo3dRoot(url)).toBe(expectedRoot);
  });

  it("should work with gcp urls", () => {
    const url =
      "http://example.com/media?filepath=gcp%3A%2F%2Fbucket%2Fpath%2Fto%2Ffile%2Fexample.fo3d";
    const expectedRoot = "gcp://bucket/path/to/file/";
    expect(getFo3dRoot(url)).toBe(expectedRoot);
  });

  it("should work with signed urls", () => {
    const signedUrl =
      "http://example.com/media?filepath=s3%3A%2F%2Fbucket%2Fpath%2Fto%2Ffile%2Fexample.fo3d?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA3SGQVQG7FGA6KKA6%2F20221104%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20221104T140227Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=b228dbec8c1008c80c162e1210e4503dceead1e4d4751b4d9787314fd6da4d55";
    const expectedRoot = "s3://bucket/path/to/file/";
    expect(getFo3dRoot(signedUrl)).toBe(expectedRoot);
  });
});
