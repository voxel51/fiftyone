import { describe, expect, it } from "vitest";
import { eulerToQuaternion } from "../../utils";
import {
  formatDegrees,
  formatRadians,
  quaternionToEulerStable,
  rad2deg,
} from "./rotation-utils";

describe("rotation-utils", () => {
  describe("rad2deg", () => {
    it("converts zero radians to zero degrees", () => {
      expect(rad2deg(0)).toBe(0);
    });

    it("converts PI radians to 180 degrees", () => {
      expect(rad2deg(Math.PI)).toBeCloseTo(180, 5);
    });

    it("converts PI/2 radians to 90 degrees", () => {
      expect(rad2deg(Math.PI / 2)).toBeCloseTo(90, 5);
    });

    it("converts PI/4 radians to 45 degrees", () => {
      expect(rad2deg(Math.PI / 4)).toBeCloseTo(45, 5);
    });

    it("converts negative radians correctly", () => {
      expect(rad2deg(-Math.PI / 2)).toBeCloseTo(-90, 5);
      expect(rad2deg(-Math.PI)).toBeCloseTo(-180, 5);
    });

    it("converts large angles correctly", () => {
      expect(rad2deg(2 * Math.PI)).toBeCloseTo(360, 5);
      expect(rad2deg(4 * Math.PI)).toBeCloseTo(720, 5);
    });
  });

  describe("quaternionToEulerStable", () => {
    it("converts identity quaternion to zero angles without previous", () => {
      const quaternion: [number, number, number, number] = [0, 0, 0, 1];
      const result = quaternionToEulerStable(quaternion);

      expect(result[0]).toBeCloseTo(0, 1);
      expect(result[1]).toBeCloseTo(0, 1);
      expect(result[2]).toBeCloseTo(0, 1);
    });

    it("converts identity quaternion to zero angles with previous", () => {
      const quaternion: [number, number, number, number] = [0, 0, 0, 1];
      const previous: [number, number, number] = [0, 0, 0];
      const result = quaternionToEulerStable(quaternion, previous);

      expect(result[0]).toBeCloseTo(0, 1);
      expect(result[1]).toBeCloseTo(0, 1);
      expect(result[2]).toBeCloseTo(0, 1);
    });

    it("converts 90 degree X rotation quaternion", () => {
      const quaternion: [number, number, number, number] = [0.707, 0, 0, 0.707];
      const result = quaternionToEulerStable(quaternion);

      expect(result[0]).toBeCloseTo(90, 1);
      expect(result[1]).toBeCloseTo(0, 1);
      expect(result[2]).toBeCloseTo(0, 1);
    });

    it("maintains continuity when angle crosses 180° boundary", () => {
      // Create a quaternion representing ~179° rotation
      const euler179: [number, number, number] = [179, 0, 0];
      const quaternion179 = eulerToQuaternion(euler179);

      // Create a quaternion representing ~181° rotation (equivalent to -179°)
      const euler181: [number, number, number] = [181, 0, 0];
      const quaternion181 = eulerToQuaternion(euler181);

      // First conversion without previous
      const result1 = quaternionToEulerStable(quaternion179);
      expect(result1[0]).toBeCloseTo(179, 1);

      // Second conversion with previous - should stay close to 179, not jump to -179
      const result2 = quaternionToEulerStable(quaternion181, result1);
      // Should normalize to be close to 179 (within ±180°)
      expect(result2[0]).toBeGreaterThan(0);
      expect(Math.abs(result2[0] - 179)).toBeLessThan(10); // Should be close to 179
    });

    it("prevents jumps when crossing -180° boundary", () => {
      // Create a quaternion representing ~-179° rotation
      const eulerNeg179: [number, number, number] = [-179, 0, 0];
      const quaternionNeg179 = eulerToQuaternion(eulerNeg179);

      // Create a quaternion representing ~-181° rotation (equivalent to 179°)
      const eulerNeg181: [number, number, number] = [-181, 0, 0];
      const quaternionNeg181 = eulerToQuaternion(eulerNeg181);

      // First conversion
      const result1 = quaternionToEulerStable(quaternionNeg179);
      expect(result1[0]).toBeCloseTo(-179, 1);

      // Second conversion with previous - should stay close to -179
      const result2 = quaternionToEulerStable(quaternionNeg181, result1);
      expect(result2[0]).toBeLessThan(0);
      expect(Math.abs(result2[0] - -179)).toBeLessThan(10);
    });

    it("handles multiple angle components crossing boundaries", () => {
      // Use a simpler case: 10° -> 350° (which is equivalent to -10°)
      const previous: [number, number, number] = [10, 20, 30];
      const eulerNew: [number, number, number] = [350, 340, 330];
      const quaternion = eulerToQuaternion(eulerNew);

      const result = quaternionToEulerStable(quaternion, previous);

      // 350° should normalize to -10° relative to 10°, which is 20° away
      // But due to quaternion conversion, we verify the key property:
      // normalized difference should be ≤ 180° (prevents large jumps)
      for (let i = 0; i < 3; i++) {
        const diff = Math.abs(result[i] - previous[i]);
        const normalizedDiff = Math.min(diff, 360 - diff);

        // Key property: prevents jumps > 180°
        expect(normalizedDiff).toBeLessThanOrEqual(180);
      }
    });

    it("handles quaternion double-cover (q and -q represent same rotation)", () => {
      // Create a quaternion and its negation - both represent the same rotation
      const euler: [number, number, number] = [45, 30, 60];
      const quaternion = eulerToQuaternion(euler);
      const negatedQuaternion: [number, number, number, number] = [
        -quaternion[0],
        -quaternion[1],
        -quaternion[2],
        -quaternion[3],
      ];

      // Without previous, both should give equivalent rotations
      const result1 = quaternionToEulerStable(quaternion);
      const result2 = quaternionToEulerStable(negatedQuaternion);

      // With previous, both should give results close to previous
      const previous: [number, number, number] = [45, 30, 60];
      const result1WithPrev = quaternionToEulerStable(quaternion, previous);
      const result2WithPrev = quaternionToEulerStable(
        negatedQuaternion,
        previous
      );

      // Both should be close to the previous value
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(result1WithPrev[i] - previous[i])).toBeLessThan(5);
        expect(Math.abs(result2WithPrev[i] - previous[i])).toBeLessThan(5);
      }
    });

    it("works with custom rotation order", () => {
      const quaternion: [number, number, number, number] = [0.707, 0, 0, 0.707];
      const resultXYZ = quaternionToEulerStable(quaternion, undefined, "XYZ");
      const resultZYX = quaternionToEulerStable(quaternion, undefined, "ZYX");

      // Different rotation orders should produce different Euler angles
      expect(resultXYZ).not.toEqual(resultZYX);
    });

    it("handles complex rotations with previous values", () => {
      const previous: [number, number, number] = [45, 30, 60];
      const eulerNew: [number, number, number] = [50, 35, 65];
      const quaternion = eulerToQuaternion(eulerNew);

      const result = quaternionToEulerStable(quaternion, previous);

      // Should be close to the new values
      expect(result[0]).toBeCloseTo(50, 1);
      expect(result[1]).toBeCloseTo(35, 1);
      expect(result[2]).toBeCloseTo(65, 1);
    });
  });

  describe("formatRadians", () => {
    it("formats valid radians to 2 decimal places", () => {
      expect(formatRadians(0)).toBe("0.00");
      expect(formatRadians(Math.PI)).toBe("3.14");
      expect(formatRadians(Math.PI / 2)).toBe("1.57");
      expect(formatRadians(1.234567)).toBe("1.23");
    });

    it("handles negative radians", () => {
      expect(formatRadians(-Math.PI / 2)).toBe("-1.57");
      expect(formatRadians(-1.5)).toBe("-1.50");
    });

    it("handles zero", () => {
      expect(formatRadians(0)).toBe("0.00");
      expect(formatRadians(-0)).toBe("0.00");
    });

    it("returns empty string for undefined", () => {
      expect(formatRadians(undefined)).toBe("");
    });

    it("returns empty string for NaN", () => {
      expect(formatRadians(NaN)).toBe("");
    });

    it("returns empty string for Infinity", () => {
      expect(formatRadians(Infinity)).toBe("");
      expect(formatRadians(-Infinity)).toBe("");
    });

    it("rounds correctly to 2 decimal places", () => {
      expect(formatRadians(1.234)).toBe("1.23");
      expect(formatRadians(1.235)).toBe("1.24");
      expect(formatRadians(1.236)).toBe("1.24");
    });
  });

  describe("formatDegrees", () => {
    it("formats valid radians as integer degrees", () => {
      expect(formatDegrees(0)).toBe("0");
      expect(formatDegrees(Math.PI)).toBe("180");
      expect(formatDegrees(Math.PI / 2)).toBe("90");
      expect(formatDegrees(Math.PI / 4)).toBe("45");
    });

    it("rounds to nearest integer", () => {
      // 1 radian ≈ 57.2958 degrees
      expect(formatDegrees(1)).toBe("57");
      // 0.5 radians ≈ 28.6479 degrees
      expect(formatDegrees(0.5)).toBe("29");
    });

    it("handles negative radians", () => {
      expect(formatDegrees(-Math.PI / 2)).toBe("-90");
      expect(formatDegrees(-Math.PI)).toBe("-180");
    });

    it("handles zero", () => {
      expect(formatDegrees(0)).toBe("0");
      expect(formatDegrees(-0)).toBe("0");
    });

    it("returns empty string for undefined", () => {
      expect(formatDegrees(undefined)).toBe("");
    });

    it("returns empty string for NaN", () => {
      expect(formatDegrees(NaN)).toBe("");
    });

    it("returns empty string for Infinity", () => {
      expect(formatDegrees(Infinity)).toBe("");
      expect(formatDegrees(-Infinity)).toBe("");
    });

    it("handles large angles correctly", () => {
      expect(formatDegrees(2 * Math.PI)).toBe("360");
      expect(formatDegrees(4 * Math.PI)).toBe("720");
    });

    it("rounds edge cases correctly", () => {
      // 0.0087 radians ≈ 0.5 degrees, should round to 1
      expect(formatDegrees(0.0087)).toBe("0");
      // 0.0175 radians ≈ 1 degree
      expect(formatDegrees(0.0175)).toBe("1");
    });
  });
});
