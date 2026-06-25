import {
  BufferGeometry,
  Float32BufferAttribute,
  Uint16BufferAttribute,
} from "three";
import { describe, expect, it } from "vitest";
import { inferPlyIsPointCloud } from "./Ply";

const buildGeometryWithoutFaces = () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  return geometry;
};

const buildGeometryWithFaces = () => {
  const geometry = buildGeometryWithoutFaces();
  geometry.setIndex(new Uint16BufferAttribute([0, 1, 2], 1));
  return geometry;
};

describe("inferPlyIsPointCloud", () => {
  it("falls back to point-cloud mode when geometry is null", () => {
    expect(inferPlyIsPointCloud(null, undefined)).toBe(true);
  });

  it("falls back to point-cloud mode when geometry is undefined", () => {
    expect(inferPlyIsPointCloud(undefined, undefined)).toBe(true);
  });

  it("returns mesh mode when geometry has indexed faces", () => {
    const geometry = buildGeometryWithFaces();
    expect(inferPlyIsPointCloud(geometry, undefined)).toBe(false);
  });

  it("returns point-cloud mode when geometry has no indexed faces", () => {
    const geometry = buildGeometryWithoutFaces();
    expect(inferPlyIsPointCloud(geometry, undefined)).toBe(true);
  });

  it("honors explicit isPointCloud overrides", () => {
    const geometry = buildGeometryWithFaces();
    expect(inferPlyIsPointCloud(geometry, true)).toBe(true);
    expect(inferPlyIsPointCloud(geometry, false)).toBe(false);
  });
});
