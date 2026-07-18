import { type PackedSplats, type SplatMesh } from "@sparkjsdev/spark";
import { Color, Quaternion, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  applySplatMeshAppearance,
  computeSplatBounds,
  getSplatBounds,
  getSplatFileTypeHint,
  requiresCovarianceSplatTransform,
} from "./GaussianSplat";
import { SPARK_MAX_STANDARD_DEVIATIONS } from "./constants";

type TestSplat = {
  center: Vector3;
  scales: Vector3;
  quaternion?: Quaternion;
};

const buildBoundsSource = (splats: TestSplat[]) => ({
  forEachSplat: (callback: Parameters<PackedSplats["forEachSplat"]>[0]) => {
    splats.forEach(({ center, scales, quaternion }, index) => {
      callback(
        index,
        center,
        scales,
        quaternion ?? new Quaternion(),
        1,
        new Color(),
      );
    });
  },
});

describe("computeSplatBounds", () => {
  it("includes centers and anisotropic splat scales", () => {
    const source = buildBoundsSource([
      {
        center: new Vector3(-1, 0, 0),
        scales: new Vector3(0.5, 0.5, 0.5),
      },
      {
        center: new Vector3(3, 1, 0),
        scales: new Vector3(1, 2, 2),
      },
    ]);

    const bounds = computeSplatBounds(source);

    expect(bounds.min.x).toBeCloseTo(-1 - 0.5 * SPARK_MAX_STANDARD_DEVIATIONS);
    expect(bounds.min.y).toBeCloseTo(1 - 2 * SPARK_MAX_STANDARD_DEVIATIONS);
    expect(bounds.min.z).toBeCloseTo(-2 * SPARK_MAX_STANDARD_DEVIATIONS);
    expect(bounds.max.x).toBeCloseTo(3 + SPARK_MAX_STANDARD_DEVIATIONS);
    expect(bounds.max.y).toBeCloseTo(1 + 2 * SPARK_MAX_STANDARD_DEVIATIONS);
    expect(bounds.max.z).toBeCloseTo(2 * SPARK_MAX_STANDARD_DEVIATIONS);
  });

  it("accounts for splat orientation", () => {
    const source = buildBoundsSource([
      {
        center: new Vector3(),
        scales: new Vector3(1, 2, 3),
        quaternion: new Quaternion().setFromAxisAngle(
          new Vector3(0, 0, 1),
          Math.PI / 2,
        ),
      },
    ]);

    const bounds = computeSplatBounds(source);

    expect(bounds.min.x).toBeCloseTo(-2 * SPARK_MAX_STANDARD_DEVIATIONS);
    expect(bounds.min.y).toBeCloseTo(-SPARK_MAX_STANDARD_DEVIATIONS);
    expect(bounds.min.z).toBeCloseTo(-3 * SPARK_MAX_STANDARD_DEVIATIONS);
    expect(bounds.max.x).toBeCloseTo(2 * SPARK_MAX_STANDARD_DEVIATIONS);
    expect(bounds.max.y).toBeCloseTo(SPARK_MAX_STANDARD_DEVIATIONS);
    expect(bounds.max.z).toBeCloseTo(3 * SPARK_MAX_STANDARD_DEVIATIONS);
  });
});

describe("getSplatBounds", () => {
  it("uses LoD splats when Spark's parent packed buffer is empty", () => {
    const lodSplats = buildBoundsSource([
      {
        center: new Vector3(2, 3, 4),
        scales: new Vector3(1, 0, 0),
      },
    ]);
    const getBoundingBox = vi.fn();
    const mesh = {
      getBoundingBox,
      packedSplats: {
        getNumSplats: () => 0,
        lodSplats,
      },
    } as unknown as SplatMesh;

    const bounds = getSplatBounds(mesh);

    expect(bounds.min.x).toBeCloseTo(2 - SPARK_MAX_STANDARD_DEVIATIONS);
    expect(bounds.min.y).toBe(3);
    expect(bounds.min.z).toBe(4);
    expect(bounds.max.x).toBeCloseTo(2 + SPARK_MAX_STANDARD_DEVIATIONS);
    expect(bounds.max.y).toBe(3);
    expect(bounds.max.z).toBe(4);
    expect(getBoundingBox).not.toHaveBeenCalled();
  });

  it("uses extended LoD splats for covariance-enabled meshes", () => {
    const lodSplats = buildBoundsSource([
      {
        center: new Vector3(-2, 1, 3),
        scales: new Vector3(0, 2, 0),
      },
    ]);
    const getBoundingBox = vi.fn();
    const mesh = {
      extSplats: {
        getNumSplats: () => 0,
        lodSplats,
      },
      getBoundingBox,
    } as unknown as SplatMesh;

    const bounds = getSplatBounds(mesh);

    expect(bounds.min.x).toBe(-2);
    expect(bounds.min.y).toBeCloseTo(1 - 2 * SPARK_MAX_STANDARD_DEVIATIONS);
    expect(bounds.min.z).toBe(3);
    expect(bounds.max.x).toBe(-2);
    expect(bounds.max.y).toBeCloseTo(1 + 2 * SPARK_MAX_STANDARD_DEVIATIONS);
    expect(bounds.max.z).toBe(3);
    expect(getBoundingBox).not.toHaveBeenCalled();
  });
});

describe("getSplatFileTypeHint", () => {
  it.each([
    ["splat", "splat"],
    [".ksplat", "ksplat"],
    ["sog", "pcsogszip"],
    ["rad", "rad"],
  ])("maps the %s format hint", (format, expected) => {
    expect(
      getSplatFileTypeHint({
        format,
        splatPath: "/media?filepath=/opaque/asset",
        splatUrl: "https://example.com/media/asset",
      }),
    ).toBe(expected);
  });

  it("infers an extension before signed URL query parameters", () => {
    expect(
      getSplatFileTypeHint({
        splatPath: "scene.spz?X-Amz-Signature=abc",
        splatUrl: "https://example.com/media",
      }),
    ).toBe("spz");
  });

  it("prefers the fetched pre-transformed representation", () => {
    expect(
      getSplatFileTypeHint({
        format: "ply",
        preTransformedSplatPath:
          "https://example.com/transformed/reconstruction.spz",
        splatPath: "/assets/reconstruction.ply",
        splatUrl: "https://example.com/transformed/reconstruction.spz",
      }),
    ).toBe("spz");
  });
});

describe("requiresCovarianceSplatTransform", () => {
  it.each([
    [new Vector3(1, 2, 1), true],
    [new Vector3(-1, -1, -1), true],
    [new Vector3(0, 0, 0), false],
    [new Vector3(2, 2, 2), false],
  ])("classifies scale %j", (scale, expected) => {
    expect(requiresCovarianceSplatTransform(scale)).toBe(expected);
  });
});

describe("applySplatMeshAppearance", () => {
  it("updates opacity, tint, and view-dependent color in place", () => {
    const mesh = {
      maxSh: 3,
      opacity: 1,
      recolor: new Color(),
      updateGenerator: vi.fn(),
    };

    applySplatMeshAppearance({
      maxSh: 1,
      mesh,
      opacity: 0.4,
      tint: "#804020",
    });

    expect(mesh.opacity).toBe(0.4);
    expect(mesh.recolor.getHexString()).toBe("804020");
    expect(mesh.maxSh).toBe(1);
    expect(mesh.updateGenerator).toHaveBeenCalledOnce();
  });

  it("does not rebuild the generator when the SH degree is unchanged", () => {
    const mesh = {
      maxSh: 3,
      opacity: 1,
      recolor: new Color(),
      updateGenerator: vi.fn(),
    };

    applySplatMeshAppearance({
      maxSh: 3,
      mesh,
      opacity: 0.8,
      tint: "#ffffff",
    });

    expect(mesh.updateGenerator).not.toHaveBeenCalled();
  });
});
