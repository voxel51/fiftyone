import { describe, expect, it } from "vitest";
import { ancestorPath, parentPath } from "./paths";

describe("teams-utilities: paths", () => {
  it("should return correct ancestor path", () => {
    expect(ancestorPath("this/is/a/nested/path", 1)).toEqual(
      "this/is/a/nested"
    );
    expect(ancestorPath("this/is/a/nested/path/", 1)).toEqual(
      "this/is/a/nested/"
    );
    expect(ancestorPath("/this/is/a/nested/path", 1)).toEqual(
      "/this/is/a/nested"
    );
    expect(ancestorPath("/this/is/a/nested/path/", 1)).toEqual(
      "/this/is/a/nested/"
    );
    expect(ancestorPath("/this/is/a/nested/path", 2)).toEqual("/this/is/a");
    expect(ancestorPath("/this/is/a/nested/path", 3)).toEqual("/this/is");
    expect(ancestorPath("/this/is/a/nested/path", 4)).toEqual("/this");
    expect(ancestorPath("this/is/a/nested/path", 6)).toEqual("");
    expect(ancestorPath("this/is/a/nested/path/", 6)).toEqual("/");
    expect(ancestorPath("/this/is/a/nested/path", 6)).toEqual("/");
    expect(ancestorPath("/this/is/a/nested/path/", 6)).toEqual("/");
    expect(ancestorPath("/this/is/a/nested/path", 7)).toEqual("/");
    expect(ancestorPath("/this/is/a/nested/path", 10)).toEqual("/");
  });

  it("should return correct parent path", () => {
    expect(parentPath("/hello/world/10")).toEqual("/hello/world");
    expect(parentPath("/hello/world/")).toEqual("/hello/");
    expect(parentPath("/hello/world")).toEqual("/hello");
    expect(parentPath("hello/world/")).toEqual("hello/");
    expect(parentPath("hello/world")).toEqual("hello");
  });
});
