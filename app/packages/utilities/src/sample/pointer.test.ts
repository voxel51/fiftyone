import { describe, expect, it } from "vitest";
import {
  buildJsonPath,
  getAtPath,
  getNestedField,
  withoutPath,
} from "./pointer";

describe("getNestedField", () => {
  it("reads a top-level field", () => {
    expect(getNestedField({ a: 1 }, "a")).toBe(1);
  });

  it("reads a nested field", () => {
    expect(getNestedField({ a: { b: { c: 2 } } }, "a.b.c")).toBe(2);
  });

  it("returns undefined for a missing segment", () => {
    expect(getNestedField({ a: { b: 1 } }, "a.x")).toBeUndefined();
    expect(getNestedField({ a: { b: 1 } }, "a.b.c")).toBeUndefined();
  });

  it("returns undefined for undefined data", () => {
    expect(getNestedField(undefined, "a")).toBeUndefined();
  });

  it("returns undefined when an intermediate is not an object", () => {
    expect(getNestedField({ a: 5 }, "a.b")).toBeUndefined();
  });

  it("distinguishes a present null from a missing field", () => {
    expect(getNestedField({ a: null }, "a")).toBeNull();
  });
});

describe("getAtPath", () => {
  it("reads object and array segments", () => {
    expect(getAtPath({ a: [{ b: 3 }] }, ["a", "0", "b"])).toBe(3);
  });

  it("returns the root for empty segments", () => {
    const root = { a: 1 };
    expect(getAtPath(root, [])).toBe(root);
  });

  it("returns undefined past a non-object", () => {
    expect(getAtPath({ a: 1 }, ["a", "b"])).toBeUndefined();
    expect(getAtPath(null, ["a"])).toBeUndefined();
  });
});

describe("withoutPath", () => {
  it("removes a leaf without mutating the source (copy-on-write)", () => {
    const root = { a: { b: 1, c: 2 } };
    const next = withoutPath(root, ["a", "b"]) as {
      a: Record<string, unknown>;
    };

    expect(next).toEqual({ a: { c: 2 } });
    // original untouched, and nodes along the path are fresh copies
    expect(root).toEqual({ a: { b: 1, c: 2 } });
    expect(next).not.toBe(root);
    expect(next.a).not.toBe(root.a);
  });

  it("removes an array element key", () => {
    const root = { list: [{ x: 1 }] };
    const next = withoutPath(root, ["list", "0", "x"]) as {
      list: Record<string, unknown>[];
    };
    expect(next.list[0]).toEqual({});
    expect(root.list[0]).toEqual({ x: 1 });
  });

  it("returns a shallow clone unchanged when the path is absent", () => {
    const root = { a: 1 };
    expect(withoutPath(root, ["b"])).toEqual({ a: 1 });
  });

  it("returns the root unchanged for empty segments or non-objects", () => {
    const root = { a: 1 };
    expect(withoutPath(root, [])).toBe(root);
    expect(withoutPath(5, ["a"])).toBe(5);
  });
});

describe("buildJsonPath", () => {
  it("combines a dot field path with an operation path", () => {
    expect(buildJsonPath("a.b", "/c/d")).toBe("/a/b/c/d");
  });

  it("handles an empty operation path (whole-field op)", () => {
    expect(buildJsonPath("ground_truth", "")).toBe("/ground_truth");
  });

  it("filters empty segments from both inputs", () => {
    expect(buildJsonPath("", "/x")).toBe("/x");
    expect(buildJsonPath("a..b", "//c")).toBe("/a/b/c");
  });
});
