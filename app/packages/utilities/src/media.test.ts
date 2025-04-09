import { describe, expect, it } from "vitest";
import {
  is3d,
  isFo3d,
  isPointCloud,
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
});
