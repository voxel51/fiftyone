import { beforeEach, describe, expect, it } from "vitest";
import { FeatureCache } from "./cache";

describe("FeatureCache", () => {
  let cache: FeatureCache;
  const feature = "some-feature";

  beforeEach(() => {
    cache = new FeatureCache();
  });

  describe("hasFeature", () => {
    it("should return false if not in the cache", () => {
      expect(cache.hasFeature(feature)).toBeFalsy();
    });

    it("should return true if the feature is enabled", () => {
      cache.setFeature(feature, true);
      expect(cache.hasFeature(feature)).toBeTruthy();
    });

    it("should return true if the feature is disabled", () => {
      cache.setFeature(feature, false);
      expect(cache.hasFeature(feature)).toBeTruthy();
    });
  });

  describe("setFeature", () => {
    it("should correctly set the feature status for enabled features", () => {
      cache.setFeature(feature, true);
      expect(cache.isFeatureEnabled(feature)).toBeTruthy();
    });

    it("should correctly set the feature status for disabled features", () => {
      cache.setFeature(feature, false);
      expect(cache.isFeatureEnabled(feature)).toBeFalsy();
    });
  });

  describe("isFeatureEnabled", () => {
    it("should return true for enabled features", () => {
      cache.setFeature(feature, true);
      expect(cache.isFeatureEnabled(feature)).toBeTruthy();
    });

    it("should return false for disabled features", () => {
      cache.setFeature(feature, false);
      expect(cache.isFeatureEnabled(feature)).toBeFalsy();
    });

    it("should return false for non-existent features", () => {
      expect(cache.isFeatureEnabled(feature)).toBeFalsy();
    });
  });

  describe("clear", () => {
    it("should clear the cache", () => {
      cache.setFeature(feature, true);
      expect(cache.isFeatureEnabled(feature)).toBeTruthy();

      cache.clear();

      expect(cache.isFeatureEnabled(feature)).toBeFalsy();
    });
  });
});
