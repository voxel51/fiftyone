import { Matrix4, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  buildFrustumGeometry,
  computeFrustumCorners,
  extrinsicsToMatrix4,
  getCameraPosition,
  isValidExtrinsics,
} from "./builders";
import type { CameraExtrinsics, CameraIntrinsics } from "./types";

describe("computeFrustumCorners", () => {
  describe("with full intrinsics (pinhole camera model)", () => {
    it("produces symmetric frustum when principal point is centered", () => {
      const intrinsics: CameraIntrinsics = {
        fx: 500,
        fy: 500,
        cx: 320, // centered for 640 width
        cy: 240, // centered for 480 height
        width: 640,
        height: 480,
      };
      const depth = 1;

      const { farCorners } = computeFrustumCorners(intrinsics, depth);

      // For centered principal point, frustum should be symmetric
      // Top-left and top-right should have same Y, opposite X
      expect(farCorners[0].y).toBeCloseTo(farCorners[1].y);
      expect(farCorners[0].x).toBeCloseTo(-farCorners[1].x);

      // Bottom-left and bottom-right should have same Y, opposite X
      expect(farCorners[2].y).toBeCloseTo(farCorners[3].y);
      expect(farCorners[2].x).toBeCloseTo(-farCorners[3].x);

      // Top and bottom should have opposite Y
      expect(farCorners[0].y).toBeCloseTo(-farCorners[3].y);
    });

    it("produces asymmetric frustum when principal point is off-center", () => {
      const intrinsics: CameraIntrinsics = {
        fx: 500,
        fy: 500,
        cx: 400, // shifted right from center (320)
        cy: 300, // shifted down from center (240)
        width: 640,
        height: 480,
      };
      const depth = 1;

      const { farCorners } = computeFrustumCorners(intrinsics, depth);

      // For off-center principal point, frustum should be asymmetric
      // Top-left X should NOT be the negative of top-right X
      expect(Math.abs(farCorners[0].x)).not.toBeCloseTo(
        Math.abs(farCorners[1].x)
      );

      // The frustum should be shifted in the opposite direction of the principal point offset
      // cx > width/2, so the frustum is shifted LEFT (negative X direction)
      const centerX = (farCorners[0].x + farCorners[1].x) / 2;
      expect(centerX).toBeLessThan(0);

      // cy > height/2, so the frustum is shifted UP (negative Y direction in CV convention)
      const centerY = (farCorners[0].y + farCorners[3].y) / 2;
      expect(centerY).toBeLessThan(0);
    });

    it("computes correct corner positions using pinhole projection", () => {
      const intrinsics: CameraIntrinsics = {
        fx: 500,
        fy: 500,
        cx: 320,
        cy: 240,
        width: 640,
        height: 480,
      };
      const depth = 1;

      const { farCorners } = computeFrustumCorners(intrinsics, depth);

      // Top-left corner (u=0, v=0): ((0 - 320) / 500, (0 - 240) / 500, 1) * depth
      expect(farCorners[0].x).toBeCloseTo(-320 / 500);
      expect(farCorners[0].y).toBeCloseTo(-240 / 500);
      expect(farCorners[0].z).toBeCloseTo(depth);

      // Top-right corner (u=640, v=0): ((640 - 320) / 500, (0 - 240) / 500, 1) * depth
      expect(farCorners[1].x).toBeCloseTo(320 / 500);
      expect(farCorners[1].y).toBeCloseTo(-240 / 500);
      expect(farCorners[1].z).toBeCloseTo(depth);

      // Bottom-right corner (u=640, v=480): ((640 - 320) / 500, (480 - 240) / 500, 1) * depth
      expect(farCorners[2].x).toBeCloseTo(320 / 500);
      expect(farCorners[2].y).toBeCloseTo(240 / 500);
      expect(farCorners[2].z).toBeCloseTo(depth);

      // Bottom-left corner (u=0, v=480): ((0 - 320) / 500, (480 - 240) / 500, 1) * depth
      expect(farCorners[3].x).toBeCloseTo(-320 / 500);
      expect(farCorners[3].y).toBeCloseTo(240 / 500);
      expect(farCorners[3].z).toBeCloseTo(depth);
    });

    it("scales corners correctly with depth", () => {
      const intrinsics: CameraIntrinsics = {
        fx: 500,
        fy: 500,
        cx: 320,
        cy: 240,
        width: 640,
        height: 480,
      };

      const corners1 = computeFrustumCorners(intrinsics, 1);
      const corners2 = computeFrustumCorners(intrinsics, 2);

      // At double the depth, corners should be at double the distance from origin (in X and Y)
      expect(corners2.farCorners[0].x).toBeCloseTo(
        corners1.farCorners[0].x * 2
      );
      expect(corners2.farCorners[0].y).toBeCloseTo(
        corners1.farCorners[0].y * 2
      );
      expect(corners2.farCorners[0].z).toBeCloseTo(2);
    });

    it("handles different fx and fy (non-square pixels)", () => {
      const intrinsics: CameraIntrinsics = {
        fx: 600, // wider FOV in X
        fy: 500, // narrower FOV in Y
        cx: 320,
        cy: 240,
        width: 640,
        height: 480,
      };
      const depth = 1;

      const { farPlaneWidth, farPlaneHeight } = computeFrustumCorners(
        intrinsics,
        depth
      );

      // Width should be smaller relative to height because fx > fy
      const widthHeightRatio = farPlaneWidth / farPlaneHeight;
      expect(widthHeightRatio).toBeLessThan(640 / 480); // less than image aspect ratio
    });
  });

  describe("fallback behavior (incomplete intrinsics)", () => {
    it("uses default FOV when intrinsics are null", () => {
      const { farCorners } = computeFrustumCorners(null, 1);

      // Should produce symmetric frustum with default aspect ratio (16:9)
      expect(farCorners[0].x).toBeCloseTo(-farCorners[1].x);
      expect(farCorners[0].y).toBeCloseTo(-farCorners[3].y);
    });

    it("uses FOV-based calculation when width/height missing", () => {
      const intrinsics: CameraIntrinsics = {
        fx: 500,
        fy: 500,
        cx: 320,
        cy: 240,
        // width and height missing
      };

      const { farCorners } = computeFrustumCorners(intrinsics, 1);

      // Should fall back to FOV-based symmetric frustum
      expect(farCorners[0].x).toBeCloseTo(-farCorners[1].x);
    });

    it("respects imageAspectRatio override in fallback mode", () => {
      const corners1 = computeFrustumCorners(null, 1, 4 / 3);
      const corners2 = computeFrustumCorners(null, 1, 16 / 9);

      const width1 = corners1.farCorners[1].x - corners1.farCorners[0].x;
      const width2 = corners2.farCorners[1].x - corners2.farCorners[0].x;

      // 16:9 should be wider than 4:3
      expect(width2).toBeGreaterThan(width1);
    });
  });
});

describe("extrinsicsToMatrix4", () => {
  it("creates identity-like matrix for zero translation and identity quaternion", () => {
    const extrinsics: CameraExtrinsics = {
      translation: [0, 0, 0],
      quaternion: [0, 0, 0, 1], // identity quaternion
    };

    const matrix = extrinsicsToMatrix4(extrinsics);

    // Should be close to identity matrix
    const identity = new Matrix4();
    for (let i = 0; i < 16; i++) {
      expect(matrix.elements[i]).toBeCloseTo(identity.elements[i]);
    }
  });

  it("applies translation correctly", () => {
    const extrinsics: CameraExtrinsics = {
      translation: [1, 2, 3],
      quaternion: [0, 0, 0, 1],
    };

    const matrix = extrinsicsToMatrix4(extrinsics);
    const position = new Vector3();
    position.setFromMatrixPosition(matrix);

    expect(position.x).toBeCloseTo(1);
    expect(position.y).toBeCloseTo(2);
    expect(position.z).toBeCloseTo(3);
  });

  it("applies rotation correctly", () => {
    // 90 degree rotation around Z axis
    const extrinsics: CameraExtrinsics = {
      translation: [0, 0, 0],
      quaternion: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
    };

    const matrix = extrinsicsToMatrix4(extrinsics);

    // Apply to a point to verify rotation
    const point = new Vector3(1, 0, 0);
    point.applyMatrix4(matrix);

    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(1);
    expect(point.z).toBeCloseTo(0);
  });

  it("normalizes quaternion to handle floating point errors", () => {
    // Slightly non-normalized quaternion
    const extrinsics: CameraExtrinsics = {
      translation: [0, 0, 0],
      quaternion: [0, 0, 0, 1.0001],
    };

    const matrix = extrinsicsToMatrix4(extrinsics);

    // Should still produce valid rotation (close to identity)
    const quaternion = new Quaternion();
    quaternion.setFromRotationMatrix(matrix);

    expect(quaternion.w).toBeCloseTo(1);
    expect(quaternion.x).toBeCloseTo(0);
    expect(quaternion.y).toBeCloseTo(0);
    expect(quaternion.z).toBeCloseTo(0);
  });
});

describe("isValidExtrinsics", () => {
  it("returns true for valid extrinsics", () => {
    const extrinsics: CameraExtrinsics = {
      translation: [1, 2, 3],
      quaternion: [0, 0, 0, 1],
    };
    expect(isValidExtrinsics(extrinsics)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isValidExtrinsics(null)).toBe(false);
  });

  it("returns false for invalid translation", () => {
    expect(
      isValidExtrinsics({
        translation: [1, 2] as any,
        quaternion: [0, 0, 0, 1],
      })
    ).toBe(false);

    expect(
      isValidExtrinsics({
        translation: [1, 2, NaN],
        quaternion: [0, 0, 0, 1],
      })
    ).toBe(false);

    expect(
      isValidExtrinsics({
        translation: [1, 2, Infinity],
        quaternion: [0, 0, 0, 1],
      })
    ).toBe(false);
  });

  it("returns false for invalid quaternion", () => {
    expect(
      isValidExtrinsics({
        translation: [1, 2, 3],
        quaternion: [0, 0, 0] as any,
      })
    ).toBe(false);

    expect(
      isValidExtrinsics({
        translation: [1, 2, 3],
        quaternion: [0, 0, 0, NaN],
      })
    ).toBe(false);
  });
});

describe("getCameraPosition", () => {
  it("returns translation as Vector3", () => {
    const extrinsics: CameraExtrinsics = {
      translation: [1, 2, 3],
      quaternion: [0, 0, 0, 1],
    };

    const position = getCameraPosition(extrinsics);

    expect(position).toBeInstanceOf(Vector3);
    expect(position.x).toBe(1);
    expect(position.y).toBe(2);
    expect(position.z).toBe(3);
  });
});

describe("buildFrustumGeometry", () => {
  it("builds complete geometry with all required fields", () => {
    const extrinsics: CameraExtrinsics = {
      translation: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
    };
    const intrinsics: CameraIntrinsics = {
      fx: 500,
      fy: 500,
      cx: 320,
      cy: 240,
      width: 640,
      height: 480,
    };

    const geometry = buildFrustumGeometry(extrinsics, intrinsics, 1);

    expect(geometry.corners).toBeInstanceOf(Float32Array);
    expect(geometry.corners.length).toBe(24); // 8 corners * 3 components
    expect(geometry.lineIndices.length).toBe(24); // 12 edges * 2 indices
    expect(geometry.farPlaneCorners.length).toBe(4);
    expect(geometry.depth).toBe(1);
    expect(typeof geometry.farPlaneWidth).toBe("number");
    expect(typeof geometry.farPlaneHeight).toBe("number");
    expect(geometry.transform).toBeInstanceOf(Matrix4);
  });

  it("applies extrinsics transform to geometry", () => {
    const extrinsics: CameraExtrinsics = {
      translation: [10, 20, 30],
      quaternion: [0, 0, 0, 1],
    };

    const geometry = buildFrustumGeometry(extrinsics, null, 1);

    // Transform should encode the translation
    const position = new Vector3();
    position.setFromMatrixPosition(geometry.transform);

    expect(position.x).toBeCloseTo(10);
    expect(position.y).toBeCloseTo(20);
    expect(position.z).toBeCloseTo(30);
  });
});
