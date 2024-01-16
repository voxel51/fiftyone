import { describe, expect, it } from "vitest";
import { matchPath } from "./matchPath";

describe("matches with proxy", () => {
  const RESULT = {
    path: "/datasets/:name",
    url: "/datasets/my-dataset",
    variables: { name: "my-dataset" },
  };

  const matchWithProxy = (search: string) =>
    matchPath(
      "/my/proxy/datasets/my-dataset",
      { path: "/datasets/:name" },
      search,
      {}
    );

  it("resolves with proxy", () => {
    expect(matchWithProxy("?proxy=/my/proxy")).toEqual(RESULT);
  });

  it("resolves with proxy, trailing slash", () => {
    expect(matchWithProxy("?proxy=/my/proxy/")).toEqual(RESULT);
  });

  it("resolves with encoded proxy", () => {
    expect(matchWithProxy("?proxy=%20my%20proxy")).toEqual(RESULT);
  });

  it("resolves with encoded proxy, trailing slash", () => {
    expect(matchWithProxy("?proxy=%20my%20proxy%20")).toEqual(RESULT);
  });
});
