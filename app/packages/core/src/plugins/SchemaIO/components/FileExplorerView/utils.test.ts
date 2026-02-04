/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, it, expect, vi } from "vitest";

// utils.ts imports from @fiftyone/utilities at the top level.
// That module has Node.js dependencies that fail in jsdom.
// This mock allows the module to load, even though limitFiles doesn't use these functions.
vi.mock("@fiftyone/utilities", () => ({
  getBasename: (path: string) => path.split("/").pop() || "",
  resolveParent: (path: string) => {
    const parts = path.split("/");
    parts.pop();
    return parts.join("/") || null;
  },
}));

import { limitFiles } from "./utils";

describe("limitFiles", () => {
  it("should always include all directories regardless of limit", () => {
    const files = [
      { type: "directory", name: "dir1" },
      { type: "directory", name: "dir2" },
      { type: "file", name: "file1" },
    ] as any[];

    const { limitedFiles } = limitFiles(files, 0);

    const dirs = limitedFiles.filter((f) => f.type === "directory");
    expect(dirs).toHaveLength(2);
  });

  it("should limit only files", () => {
    const files = [
      { type: "directory", name: "dir1" },
      { type: "file", name: "file1" },
      { type: "file", name: "file2" },
      { type: "file", name: "file3" },
    ] as any[];

    const { limitedFiles } = limitFiles(files, 2);

    expect(limitedFiles).toHaveLength(3); // 1 dir + 2 files
  });

  it("should return file count (not including directories)", () => {
    const files = [
      { type: "directory", name: "dir1" },
      { type: "file", name: "file1" },
      { type: "file", name: "file2" },
    ] as any[];

    const { fileCount } = limitFiles(files, 10);

    expect(fileCount).toBe(2);
  });

  it("should put directories before files", () => {
    const files = [
      { type: "file", name: "file1" },
      { type: "directory", name: "dir1" },
    ] as any[];

    const { limitedFiles } = limitFiles(files, 10);

    expect(limitedFiles[0].type).toBe("directory");
    expect(limitedFiles[1].type).toBe("file");
  });
});
