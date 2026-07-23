import { describe, expect, it } from "vitest";
import { fileTargets, patchTouches, testSpans } from "./burn-in-specs.mjs";

const SOURCE = `import { test } from "src/oss/fixtures";

test.describe("suite", () => {
  test.beforeEach(async () => {
    await setup();
  });

  test("first", async () => {
    await expect(thing(")")).toBe(1);
  });

  // test("commented out", () => {});
  test.skip("second", async () => {
    const s = \`template \${open("(")}\`;
  });
});
`;

const line = (n) => SOURCE.split("\n")[n - 1];

describe("testSpans", () => {
  it("spans each test() call, ignoring strings, templates, and comments", () => {
    expect(testSpans(SOURCE)).toEqual([
      { line: 8, endLine: 10 },
      { line: 13, endLine: 15 },
    ]);
  });

  it("returns null for an unbalanced call", () => {
    expect(testSpans('test("dangling", async () => {')).toBeNull();
  });
});

describe("patchTouches", () => {
  it("tracks added lines and attributes deletions to the next line", () => {
    const patch = [
      "@@ -4,4 +4,3 @@",
      ` ${line(4)}`,
      "-    await legacySetup();",
      `+${line(5)}`,
      ` ${line(6)}`,
    ].join("\n");
    const { touched, verify } = patchTouches(patch);
    expect([...touched]).toEqual([5]);
    expect(verify).toEqual([
      [4, line(4)],
      [5, line(5)],
      [6, line(6)],
    ]);
  });
});

describe("fileTargets", () => {
  const path = "src/oss/specs/sample.spec.ts";

  it("targets only the test a hunk lands in", () => {
    const patch = [
      "@@ -8,3 +8,3 @@",
      ` ${line(8)}`,
      "-    await expect(old).toBe(1);",
      `+${line(9)}`,
      ` ${line(10)}`,
    ].join("\n");
    expect(fileTargets(path, patch, SOURCE)).toEqual([`${path}:8`]);
  });

  it("targets each test a multi-hunk diff lands in", () => {
    const patch = [
      "@@ -8,3 +8,3 @@",
      ` ${line(8)}`,
      "-    await expect(old).toBe(1);",
      `+${line(9)}`,
      ` ${line(10)}`,
      "@@ -13,3 +13,3 @@",
      ` ${line(13)}`,
      "-    const s = old;",
      `+${line(14)}`,
      ` ${line(15)}`,
    ].join("\n");
    expect(fileTargets(path, patch, SOURCE)).toEqual([
      `${path}:8`,
      `${path}:13`,
    ]);
  });

  it("targets the declaration when a leading comment is deleted with it", () => {
    const patch = [
      "@@ -12,3 +12,2 @@",
      ` ${line(12)}`,
      "-  // flaky: passed only on retry",
      '-  test("second", async () => {',
      `+${line(13)}`,
    ].join("\n");
    expect(fileTargets(path, patch, SOURCE)).toEqual([`${path}:13`]);
  });

  it("falls back to the whole file for shared-code edits", () => {
    const patch = ["@@ -4,2 +4,2 @@", ` ${line(4)}`, `+${line(5)}`].join("\n");
    expect(fileTargets(path, patch, SOURCE)).toEqual([path]);
  });

  it("falls back to the whole file when disk content drifts from the patch", () => {
    const patch = [
      "@@ -8,2 +8,2 @@",
      " some line the merge commit rewrote",
      `+${line(9)}`,
    ].join("\n");
    expect(fileTargets(path, patch, SOURCE)).toEqual([path]);
  });

  it("falls back to the whole file when the patch is missing", () => {
    expect(fileTargets(path, undefined, SOURCE)).toEqual([path]);
  });
});
