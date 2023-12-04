import { describe, expect, it } from "vitest";
import * as paths from "./paths";

describe("paths", () => {
  describe("determinePathType", () => {
    it("should detect URLs", () => {
      expect(paths.determinePathType("http://example.com")).toBe(
        paths.PathType.URL
      );
      expect(paths.determinePathType("https://example.com")).toBe(
        paths.PathType.URL
      );
      expect(paths.determinePathType("s3://example.com")).toBe(
        paths.PathType.URL
      );
    });

    it("should detect Linux paths", () => {
      expect(paths.determinePathType("/home/user/file.txt")).toBe(
        paths.PathType.LINUX
      );
      expect(paths.determinePathType("~/file.txt")).toBe(paths.PathType.LINUX);
    });

    it("should detect Windows paths", () => {
      expect(paths.determinePathType("C:\\Users\\user\\file.txt")).toBe(
        paths.PathType.WINDOWS
      );
      expect(paths.determinePathType("\\\\server\\share\\file.txt")).toBe(
        paths.PathType.WINDOWS
      );
    });
  });

  describe("getSeparator", () => {
    it("should return the correct separator for the given path type", () => {
      expect(paths.getSeparator(paths.PathType.URL)).toBe("/");
      expect(paths.getSeparator(paths.PathType.LINUX)).toBe("/");
      expect(paths.getSeparator(paths.PathType.WINDOWS)).toBe("\\");
    });
  });

  describe("joinPaths", () => {
    it("should join paths correctly", () => {
      expect(
        paths.joinPaths(
          "https://cloud.com/bucket",
          "data",
          "folder1",
          "folder2",
          "file.txt"
        )
      ).toBe("https://cloud.com/bucket/data/folder1/folder2/file.txt");
      expect(paths.joinPaths("/home/user", "docs", "notes.txt")).toBe(
        "/home/user/docs/notes.txt"
      );
      expect(paths.joinPaths("C:\\Windows", "System32", "drivers")).toBe(
        "C:\\Windows\\System32\\drivers"
      );
      expect(paths.joinPaths("/foo", "..")).toBe("/");
    });
  });

  describe("getProtocol", () => {
    it("should return the correct protocol for the given path type", () => {
      expect(paths.getProtocol("http://domain")).toBe("http");
      expect(paths.getProtocol("http://")).toBe("http");
      expect(paths.getProtocol("s3://domain.com/foo?bar")).toBe("s3");
      expect(paths.getProtocol("/foo/bar")).toBe(undefined);
      expect(paths.getProtocol("C:\\hello\\world")).toBe(undefined);
      expect(paths.getProtocol("C:\\")).toBe(undefined);
      expect(paths.getProtocol("/")).toBe(undefined);
    });
  });

  describe("resolveParent", () => {
    it("should resolve the parent directory", () => {
      expect(
        paths.resolveParent(
          "https://cloud.com/bucket/data/folder1/folder2/file.txt"
        )
      ).toBe("https://cloud.com/bucket/data/folder1/folder2/");
      expect(paths.resolveParent("/home/user/docs/notes.txt")).toBe(
        "/home/user/docs"
      );
      expect(paths.resolveParent("C:\\Windows\\System32\\drivers")).toBe(
        "C:\\Windows\\System32"
      );
      expect(paths.resolveParent("C:\\Windows")).toBe("C:\\");
      expect(paths.resolveParent("s3://foo")).toBe("s3://");
      expect(paths.resolveParent("/")).toBe(null);
      expect(paths.resolveParent("/my-path")).toBe("/");
      expect(paths.resolveParent("s3://")).toBe(null);
      expect(paths.resolveParent("min.io://voxel51-test")).toBe("min.io://");
      expect(paths.resolveParent("http://localhost:9000/voxel51-test")).toBe(
        "http://localhost:9000/"
      );
      expect(
        paths.resolveParent(
          "https://computervisionteam.blob.core.windows.net/voxel51-test"
        )
      ).toBe("https://computervisionteam.blob.core.windows.net/");
      expect(paths.resolveParent("az://")).toBe(null);
      expect(paths.resolveParent("min.io://")).toBe(null);
      expect(paths.resolveParent("min.io://bucket/folder")).toBe(
        "min.io://bucket/"
      );
      expect(paths.resolveParent("min.io://bucket//")).toBe("min.io://bucket/");
      expect(paths.resolveParent("min.io://bucket/./")).toBe(
        "min.io://bucket/"
      );
      expect(
        paths.resolveParent(
          "https://computervisionteam.blob.core.windows.net/voxel51-test/"
        )
      ).toBe("https://computervisionteam.blob.core.windows.net/");
      expect(paths.resolveParent("min.io://bucket/folder/")).toBe(
        "min.io://bucket/"
      );
      expect(paths.resolveParent("min.io://voxel51-test/")).toBe("min.io://");
    });
  });

  describe("getBasename", () => {
    it("should return the basename", () => {
      expect(
        paths.getBasename(
          "https://cloud.com/bucket/data/folder1/folder2/file.txt"
        )
      ).toBe("file.txt");
      expect(paths.getBasename("/home/user/docs/notes.txt")).toBe("notes.txt");
      expect(paths.getBasename("C:\\Windows\\System32\\drivers")).toBe(
        "drivers"
      );
      expect(paths.getBasename("s3://foo")).toBe("foo");
      expect(paths.getBasename("/")).toBe(null);
      expect(paths.getBasename("s3://")).toBe(null);
    });
  });

  describe("getRootOrProtocol", () => {
    it("should return the root", () => {
      expect(
        paths.getRootOrProtocol(
          "https://cloud.com/bucket/data/folder1/folder2/file.txt"
        )
      ).toBe("https://");
      expect(paths.getRootOrProtocol("/home/user/docs/notes.txt")).toBe("/");
      expect(paths.getRootOrProtocol("C:\\Windows\\System32\\drivers")).toBe(
        "C:\\"
      );
      expect(paths.getRootOrProtocol("s3://foo")).toBe("s3://");
      expect(paths.getRootOrProtocol("/")).toBe("/");
      expect(paths.getRootOrProtocol("s3://")).toBe("s3://");
    });
  });
});
