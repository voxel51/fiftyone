import {
  BufferGeometry,
  Float32BufferAttribute,
  Uint16BufferAttribute,
} from "three";
import { describe, expect, it } from "vitest";
import {
  extractPlyHeaderText,
  inferPlyHeaderIsGaussianSplat,
  readPlyHeaderText,
} from "./ply-splat-detection";
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

describe("inferPlyHeaderIsGaussianSplat", () => {
  it("detects Graphdeco-style spherical-harmonic splat PLY headers", () => {
    const header = `ply
format binary_little_endian 1.0
element vertex 2
property float x
property float y
property float z
property float nx
property float ny
property float nz
property float f_dc_0
property float f_dc_1
property float f_dc_2
property float opacity
property float scale_0
property float scale_1
property float scale_2
property float rot_0
property float rot_1
property float rot_2
property float rot_3
end_header
`;

    expect(inferPlyHeaderIsGaussianSplat(header)).toBe(true);
  });

  it("detects RGB splat PLY headers", () => {
    const header = `ply
format binary_little_endian 1.0
element vertex 2
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
property float opacity
property float scale_0
property float scale_1
property float scale_2
property float rot_0
property float rot_1
property float rot_2
property float rot_3
end_header
`;

    expect(inferPlyHeaderIsGaussianSplat(header)).toBe(true);
  });

  it("detects splats whose optional color and opacity fields are absent", () => {
    const header = `ply
format binary_little_endian 1.0
element vertex 2
property float x
property float y
property float z
property float scale_0
property float scale_1
property float scale_2
property float rot_0
property float rot_1
property float rot_2
property float rot_3
end_header
`;

    expect(inferPlyHeaderIsGaussianSplat(header)).toBe(true);
  });

  it("detects compressed SuperSplat PLY headers", () => {
    const header = `ply
format binary_little_endian 1.0
element chunk 1
property float min_x
property float min_y
property float min_z
property float max_x
property float max_y
property float max_z
property float min_scale_x
property float min_scale_y
property float min_scale_z
property float max_scale_x
property float max_scale_y
property float max_scale_z
element vertex 2
property uint packed_position
property uint packed_rotation
property uint packed_scale
property uint packed_color
end_header
`;

    expect(inferPlyHeaderIsGaussianSplat(header)).toBe(true);
  });

  it("does not detect ordinary mesh PLY headers", () => {
    const header = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
element face 1
property list uchar int vertex_indices
end_header
`;

    expect(inferPlyHeaderIsGaussianSplat(header)).toBe(false);
  });

  it("requires Gaussian transform fields", () => {
    const header = `ply
format binary_little_endian 1.0
element vertex 2
property float x
property float y
property float z
property float f_dc_0
property float f_dc_1
property float f_dc_2
property float opacity
end_header
`;

    expect(inferPlyHeaderIsGaussianSplat(header)).toBe(false);
  });
});

describe("extractPlyHeaderText", () => {
  it("extracts the header without requiring the full PLY body", () => {
    const header = `ply
format ascii 1.0
element vertex 1
property float x
end_header
`;
    const bytes = new TextEncoder().encode(`${header}0.1 binary body`);

    expect(extractPlyHeaderText(bytes.buffer)).toBe(header);
  });

  it("ignores end_header text outside the terminator line", () => {
    const header = `ply
format ascii 1.0
comment converted by an end_header-aware exporter
element vertex 1
property float x
end_header
`;
    const bytes = new TextEncoder().encode(`${header}0.1 binary body`);

    expect(extractPlyHeaderText(bytes.buffer)).toBe(header);
  });

  it("stops reading after the header", async () => {
    const header = `ply
format ascii 1.0
element vertex 1
property float x
end_header
`;
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(header));
          controller.enqueue(new Uint8Array(1024 * 1024));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );

    await expect(readPlyHeaderText(response)).resolves.toBe(header);
    expect(cancelled).toBe(true);
  });
});
