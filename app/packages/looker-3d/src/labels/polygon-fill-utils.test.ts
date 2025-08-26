import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import {
  buildClosedLoopsFromSegments,
  newellNormal,
  createFilledPolygonMesh,
  createFilledPolygonMeshes,
} from "./polygon-fill-utils";

describe("polygon-fill-utils", () => {
  describe("buildClosedLoopsFromSegments", () => {
    it("should build a simple closed loop from segments", () => {
      const segments: THREE.Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [1, 0, 0],
          [1, 1, 0],
        ],
        [
          [1, 1, 0],
          [0, 1, 0],
        ],
        [
          [0, 1, 0],
          [0, 0, 0],
        ],
      ];

      const result = buildClosedLoopsFromSegments(segments);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(4);
      expect(result[0]).toEqual([
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ]);
    });

    it("should handle duplicate segments", () => {
      const segments: THREE.Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [1, 0, 0],
          [1, 1, 0],
        ],
        [
          [1, 1, 0],
          [0, 1, 0],
        ],
        [
          [0, 1, 0],
          [0, 0, 0],
        ],
        [
          [0, 0, 0],
          [1, 0, 0],
        ], // duplicate
        [
          [1, 0, 0],
          [1, 1, 0],
        ], // duplicate
      ];

      const result = buildClosedLoopsFromSegments(segments);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(4);
    });

    it("should handle multiple disconnected loops", () => {
      const segments: THREE.Vector3Tuple[][] = [
        // First square
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [1, 0, 0],
          [1, 1, 0],
        ],
        [
          [1, 1, 0],
          [0, 1, 0],
        ],
        [
          [0, 1, 0],
          [0, 0, 0],
        ],
        // Second square (offset)
        [
          [2, 0, 0],
          [3, 0, 0],
        ],
        [
          [3, 0, 0],
          [3, 1, 0],
        ],
        [
          [3, 1, 0],
          [2, 1, 0],
        ],
        [
          [2, 1, 0],
          [2, 0, 0],
        ],
      ];

      const result = buildClosedLoopsFromSegments(segments);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(4);
      expect(result[1]).toHaveLength(4);
    });

    it("should ignore self-loops", () => {
      const segments: THREE.Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [0, 0, 0],
        ], // self-loop
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [1, 0, 0],
          [1, 1, 0],
        ],
        [
          [1, 1, 0],
          [0, 1, 0],
        ],
        [
          [0, 1, 0],
          [0, 0, 0],
        ],
      ];

      const result = buildClosedLoopsFromSegments(segments);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(4);
    });

    it("should ignore invalid segments with less than 2 points", () => {
      const segments: THREE.Vector3Tuple[][] = [
        [[0, 0, 0]], // invalid - only 1 point
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [1, 0, 0],
          [1, 1, 0],
        ],
        [
          [1, 1, 0],
          [0, 1, 0],
        ],
        [
          [0, 1, 0],
          [0, 0, 0],
        ],
      ];

      const result = buildClosedLoopsFromSegments(segments);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(4);
    });

    it("should return empty array for no valid loops", () => {
      const segments: THREE.Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ], // dangling edge
        [
          [2, 0, 0],
          [3, 0, 0],
        ], // another dangling edge
      ];

      const result = buildClosedLoopsFromSegments(segments);

      expect(result).toHaveLength(0);
    });

    it("should handle complex polygon with many vertices", () => {
      const segments: THREE.Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [1, 0, 0],
          [2, 0, 0],
        ],
        [
          [2, 0, 0],
          [2, 1, 0],
        ],
        [
          [2, 1, 0],
          [2, 2, 0],
        ],
        [
          [2, 2, 0],
          [1, 2, 0],
        ],
        [
          [1, 2, 0],
          [0, 2, 0],
        ],
        [
          [0, 2, 0],
          [0, 1, 0],
        ],
        [
          [0, 1, 0],
          [0, 0, 0],
        ],
      ];

      const result = buildClosedLoopsFromSegments(segments);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(8);
    });
  });

  describe("newellNormal", () => {
    it("should compute normal for a simple square in XY plane", () => {
      const pts = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(1, 1, 0),
        new THREE.Vector3(0, 1, 0),
      ];

      const normal = newellNormal(pts);

      expect(normal.x).toBeCloseTo(0, 6);
      expect(normal.y).toBeCloseTo(0, 6);
      expect(normal.z).toBeCloseTo(1, 6);
    });

    it("should compute normal for a triangle in XY plane", () => {
      const pts = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0),
      ];

      const normal = newellNormal(pts);

      expect(normal.x).toBeCloseTo(0, 6);
      expect(normal.y).toBeCloseTo(0, 6);
      expect(normal.z).toBeCloseTo(1, 6);
    });

    it("should compute normal for a polygon in XZ plane", () => {
      const pts = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(1, 0, 1),
        new THREE.Vector3(0, 0, 1),
      ];

      const normal = newellNormal(pts);

      expect(normal.x).toBeCloseTo(0, 6);
      expect(normal.y).toBeCloseTo(-1, 6);
      expect(normal.z).toBeCloseTo(0, 6);
    });

    it("should handle degenerate case and return default normal", () => {
      const pts = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 0), // duplicate point
        new THREE.Vector3(0, 0, 0), // another duplicate
      ];

      const normal = newellNormal(pts);

      expect(normal.x).toBeCloseTo(0, 6);
      expect(normal.y).toBeCloseTo(0, 6);
      expect(normal.z).toBeCloseTo(1, 6);
    });

    it("should compute normal for a polygon with non-zero Z coordinates", () => {
      const pts = [
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(1, 0, 1),
        new THREE.Vector3(1, 1, 1),
        new THREE.Vector3(0, 1, 1),
      ];

      const normal = newellNormal(pts);

      expect(normal.x).toBeCloseTo(0, 6);
      expect(normal.y).toBeCloseTo(0, 6);
      expect(normal.z).toBeCloseTo(1, 6);
    });
  });

  describe("createFilledPolygonMesh", () => {
    it("should create a mesh for a simple square", () => {
      const loop: THREE.Vector3Tuple[] = [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ];
      const material = new THREE.MeshBasicMaterial();

      const mesh = createFilledPolygonMesh(loop, material);

      expect(mesh).not.toBeNull();
      expect(mesh).toBeInstanceOf(THREE.Mesh);
      expect(mesh?.geometry).toBeInstanceOf(THREE.BufferGeometry);
      expect(mesh?.material).toBe(material);
    });

    it("should create a mesh for a triangle", () => {
      const loop: THREE.Vector3Tuple[] = [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ];
      const material = new THREE.MeshBasicMaterial();

      const mesh = createFilledPolygonMesh(loop, material);

      expect(mesh).not.toBeNull();
      expect(mesh).toBeInstanceOf(THREE.Mesh);
    });

    it("should handle polygon in different plane", () => {
      const loop: THREE.Vector3Tuple[] = [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1],
      ];
      const material = new THREE.MeshBasicMaterial();

      const mesh = createFilledPolygonMesh(loop, material);

      expect(mesh).not.toBeNull();
      expect(mesh).toBeInstanceOf(THREE.Mesh);
    });

    it("should return null for invalid polygon (less than 3 points)", () => {
      const loop: THREE.Vector3Tuple[] = [
        [0, 0, 0],
        [1, 0, 0],
      ];
      const material = new THREE.MeshBasicMaterial();

      const mesh = createFilledPolygonMesh(loop, material);

      expect(mesh).toBeNull();
    });

    it("should return null for degenerate polygon with duplicate points", () => {
      // Create a degenerate polygon with duplicate points
      const loop: THREE.Vector3Tuple[] = [
        [0, 0, 0],
        [0, 0, 0], // duplicate point
        [0, 0, 0], // another duplicate
      ];
      const material = new THREE.MeshBasicMaterial();

      const mesh = createFilledPolygonMesh(loop, material);

      expect(mesh).toBeNull();
    });

    it("should handle triangulation failure gracefully", () => {
      // Create a polygon that would cause issues with the basis construction
      // by making the normal vector very close to the reference axis
      const loop: THREE.Vector3Tuple[] = [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0.0001, 0], // Very small Y offset to make normal close to (0,0,1)
        [0, 0.0001, 0],
      ];
      const material = new THREE.MeshBasicMaterial();

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Mock the crossVectors method to throw an error
      const originalCrossVectors = THREE.Vector3.prototype.crossVectors;
      THREE.Vector3.prototype.crossVectors = vi.fn().mockImplementation(() => {
        throw new Error("Cross product failed");
      });

      const mesh = createFilledPolygonMesh(loop, material);

      expect(mesh).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to create filled polygon mesh:",
        expect.any(Error)
      );

      // Restore original method
      THREE.Vector3.prototype.crossVectors = originalCrossVectors;
      consoleSpy.mockRestore();
    });
  });

  describe("createFilledPolygonMeshes", () => {
    it("should create meshes from segments", () => {
      const points3d: THREE.Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [1, 0, 0],
          [1, 1, 0],
        ],
        [
          [1, 1, 0],
          [0, 1, 0],
        ],
        [
          [0, 1, 0],
          [0, 0, 0],
        ],
      ];
      const material = new THREE.MeshBasicMaterial();

      const meshes = createFilledPolygonMeshes(points3d, material);

      expect(meshes).not.toBeNull();
      expect(meshes).toHaveLength(1);
      expect(meshes![0]).toBeInstanceOf(THREE.Mesh);
    });

    it("should handle single polyline as closed loop", () => {
      const points3d: THREE.Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
          [0, 1, 0],
          [0, 0, 0], // closed loop
        ],
      ];
      const material = new THREE.MeshBasicMaterial();

      const meshes = createFilledPolygonMeshes(points3d, material);

      expect(meshes).not.toBeNull();
      expect(meshes).toHaveLength(1);
      expect(meshes![0]).toBeInstanceOf(THREE.Mesh);
    });

    it("should handle multiple disconnected loops", () => {
      const points3d: THREE.Vector3Tuple[][] = [
        // First square
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [1, 0, 0],
          [1, 1, 0],
        ],
        [
          [1, 1, 0],
          [0, 1, 0],
        ],
        [
          [0, 1, 0],
          [0, 0, 0],
        ],
        // Second square
        [
          [2, 0, 0],
          [3, 0, 0],
        ],
        [
          [3, 0, 0],
          [3, 1, 0],
        ],
        [
          [3, 1, 0],
          [2, 1, 0],
        ],
        [
          [2, 1, 0],
          [2, 0, 0],
        ],
      ];
      const material = new THREE.MeshBasicMaterial();

      const meshes = createFilledPolygonMeshes(points3d, material);

      expect(meshes).not.toBeNull();
      expect(meshes).toHaveLength(2);
      expect(meshes![0]).toBeInstanceOf(THREE.Mesh);
      expect(meshes![1]).toBeInstanceOf(THREE.Mesh);
    });

    it("should return null for no valid polygons", () => {
      const points3d: THREE.Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ], // dangling edge
        [
          [2, 0, 0],
          [3, 0, 0],
        ], // another dangling edge
      ];
      const material = new THREE.MeshBasicMaterial();

      const meshes = createFilledPolygonMeshes(points3d, material);

      expect(meshes).toBeNull();
    });

    it("should return null for single polyline with less than 3 points", () => {
      const points3d: THREE.Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ], // only 2 points
      ];
      const material = new THREE.MeshBasicMaterial();

      const meshes = createFilledPolygonMeshes(points3d, material);

      expect(meshes).toBeNull();
    });

    it("should handle empty input", () => {
      const points3d: THREE.Vector3Tuple[][] = [];
      const material = new THREE.MeshBasicMaterial();

      const meshes = createFilledPolygonMeshes(points3d, material);

      expect(meshes).toBeNull();
    });
  });
});
