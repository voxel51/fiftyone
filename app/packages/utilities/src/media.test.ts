import { describe, expect, it } from "vitest";
import {
  getSamplePathExtension,
  is3d,
  isDirect3dSamplePath,
  isFo3d,
  isFo3dSamplePath,
  isPointCloud,
  isWrappableDirect3dSamplePath,
  setContains3d,
  setContainsFo3d,
  setContainsPointCloud,
} from "./media";

const pointCloudTypes = ["point-cloud", "point_cloud"];
const fo3dTypes = ["3d", "three_d"];
const otherTypes = ["image", "video", "other", undefined];

describe("media utils", () => {
  describe("isFo3d", () => {
    it("should return true for FO3D types", () => {
      fo3dTypes.forEach((mt) => expect(isFo3d(mt)).toBeTruthy());
    });

    it("should return false for other types", () => {
      pointCloudTypes.forEach((mt) => expect(isFo3d(mt)).toBeFalsy());
      otherTypes.forEach((mt) => expect(isFo3d(mt)).toBeFalsy());
    });
  });

  describe("isPointCloud", () => {
    it("should return true for point cloud types", () => {
      pointCloudTypes.forEach((mt) => expect(isPointCloud(mt)).toBeTruthy());
    });

    it("should return false for other types", () => {
      fo3dTypes.forEach((mt) => expect(isPointCloud(mt)).toBeFalsy());
      otherTypes.forEach((mt) => expect(isPointCloud(mt)).toBeFalsy());
    });
  });

  describe("is3d", () => {
    it("should return true for 3d types", () => {
      fo3dTypes.forEach((mt) => expect(is3d(mt)).toBeTruthy());
      pointCloudTypes.forEach((mt) => expect(is3d(mt)).toBeTruthy());
    });

    it("should return false for other types", () => {
      otherTypes.forEach((mt) => expect(is3d(mt)).toBeFalsy());
    });
  });

  describe("setContainsFo3d", () => {
    it("should return true for FO3D types", () => {
      expect(setContainsFo3d(new Set(fo3dTypes))).toBeTruthy();
    });

    it("should return false for other types", () => {
      expect(setContainsFo3d(new Set(pointCloudTypes))).toBeFalsy();
      expect(setContainsFo3d(new Set(otherTypes))).toBeFalsy();
    });
  });

  describe("setContainsPointCloud", () => {
    it("should return true for point cloud types", () => {
      expect(setContainsPointCloud(new Set(pointCloudTypes))).toBeTruthy();
    });

    it("should return false for other types", () => {
      expect(setContainsPointCloud(new Set(fo3dTypes))).toBeFalsy();
      expect(setContainsPointCloud(new Set(otherTypes))).toBeFalsy();
    });
  });

  describe("setContains3d", () => {
    it("should return true for 3d types", () => {
      expect(setContains3d(new Set(fo3dTypes))).toBeTruthy();
      expect(setContains3d(new Set(pointCloudTypes))).toBeTruthy();
    });

    it("should return false for other types", () => {
      expect(setContains3d(new Set(otherTypes))).toBeFalsy();
    });
  });

  describe("getSamplePathExtension", () => {
    it("extracts extension from plain file paths", () => {
      expect(getSamplePathExtension("/tmp/example/file.pcd")).toBe(".pcd");
      expect(getSamplePathExtension("/tmp/example/file.FO3D")).toBe(".fo3d");
    });

    it("extracts extension from signed URLs", () => {
      expect(
        getSamplePathExtension(
          "https://example.com/path/to/file.PLY?X-Amz-Signature=abc123",
        ),
      ).toBe(".ply");
    });

    it("extracts extension from media filepath query parameter", () => {
      expect(
        getSamplePathExtension("/media?filepath=/tmp/assets/model.glTF"),
      ).toBe(".gltf");

      expect(
        getSamplePathExtension(
          "http://localhost:5151/media?filepath=%2FUsers%2Fsashankaryal%2Ffiftyone%2Fdata%2Fdirect-3d%2Fpcd_dataset%2Fcube_1.pcd",
        ),
      ).toBe(".pcd");

      expect(
        getSamplePathExtension(
          "/media?filepath=%2Ftmp%2Fassets%2Fmesh.STL%3Fversion%3D1",
        ),
      ).toBe(".stl");
    });

    it("prefers the URL path when the asset is already encoded there", () => {
      expect(
        getSamplePathExtension(
          "https://storage.googleapis.com/example-bucket/meshes/cube_1.glb?filepath=%2Ftmp%2Fother-file.txt&X-Goog-Signature=abc123",
        ),
      ).toBe(".glb");
    });

    it("returns null for unsupported or invalid paths", () => {
      expect(getSamplePathExtension("/tmp/example/file")).toBeNull();
      expect(getSamplePathExtension("https://example.com")).toBeNull();
      expect(getSamplePathExtension("")).toBeNull();
      expect(getSamplePathExtension(null)).toBeNull();
      expect(getSamplePathExtension(undefined)).toBeNull();
    });
  });

  describe("isDirect3dSamplePath", () => {
    it("returns true for supported direct 3d extensions", () => {
      const direct3dPaths = [
        "/tmp/example/file.fo3d",
        "/tmp/example/file.pcd",
        "/tmp/example/file.ply",
        "/tmp/example/file.gltf",
        "/tmp/example/file.glb",
        "/tmp/example/file.fbx",
        "/tmp/example/file.stl",
      ];

      direct3dPaths.forEach((path) =>
        expect(isDirect3dSamplePath(path)).toBeTruthy(),
      );
    });

    it("returns false for unsupported direct 3d extensions", () => {
      expect(isDirect3dSamplePath("/tmp/example/file.obj")).toBeFalsy();
      expect(isDirect3dSamplePath("/tmp/example/file.mtl")).toBeFalsy();
      expect(isDirect3dSamplePath("/tmp/example/file.png")).toBeFalsy();
    });
  });

  describe("isFo3dSamplePath", () => {
    it("returns true only for real fo3d scene files", () => {
      expect(isFo3dSamplePath("/tmp/example/file.fo3d")).toBe(true);
      expect(
        isFo3dSamplePath(
          "https://example.com/assets/scene.FO3D?X-Amz-Signature=abc123",
        ),
      ).toBe(true);
    });

    it("returns false for non-fo3d 3d assets", () => {
      expect(isFo3dSamplePath("/tmp/example/file.pcd")).toBe(false);
      expect(isFo3dSamplePath("/tmp/example/file.gltf")).toBe(false);
      expect(isFo3dSamplePath("/tmp/example/file.ply")).toBe(false);
    });
  });

  describe("isWrappableDirect3dSamplePath", () => {
    it("returns true for wrappable direct 3d extensions", () => {
      const wrappablePaths = [
        "/tmp/example/file.pcd",
        "/tmp/example/file.ply",
        "/tmp/example/file.gltf",
        "/tmp/example/file.glb",
        "/tmp/example/file.fbx",
        "/tmp/example/file.stl",
        "/media?filepath=/tmp/example/file.PCD",
      ];

      wrappablePaths.forEach((path) =>
        expect(isWrappableDirect3dSamplePath(path)).toBeTruthy(),
      );
    });

    it("returns false for excluded or unsupported extensions", () => {
      expect(isWrappableDirect3dSamplePath("/tmp/example/file.fo3d")).toBe(
        false,
      );
      expect(isWrappableDirect3dSamplePath("/tmp/example/file.obj")).toBe(
        false,
      );
      expect(isWrappableDirect3dSamplePath("/tmp/example/file.mtl")).toBe(
        false,
      );
      expect(isWrappableDirect3dSamplePath("/tmp/example/file.jpg")).toBe(
        false,
      );
    });
  });
});
