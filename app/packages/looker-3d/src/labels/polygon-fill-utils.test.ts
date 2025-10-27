import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createFilledPolygonMesh,
  createFilledPolygonMeshes,
  newellNormal,
} from "./polygon-fill-utils";

describe("polygon-fill-utils", () => {
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
    it("should return null for disjoint segments (we don't fill disjoint segments)", () => {
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

      expect(meshes).toBeNull();
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

    it("should return null for multiple disconnected segments (we don't fill disjoint segments)", () => {
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

      expect(meshes).toBeNull();
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
