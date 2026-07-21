import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { VISUALIZATION_KIND } from "../visualization-registry";
import {
  imageTextureCacheStats,
  resetImageTextureCacheForTests,
} from "../image/image-texture-cache";
import {
  PointCloudPanel,
  sampleColormap,
  type PointCloudColorSettings,
} from "./index";
import { POINT_CLOUD_POINTS_MATERIAL_PROPS } from "./PointCloudSceneLayer";

vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn(),
  useThree: (
    selector: (state: {
      invalidate: () => void;
      viewport: { dpr: number };
    }) => unknown,
  ) => selector({ invalidate: vi.fn(), viewport: { dpr: 1 } }),
}));

vi.mock("./base-3d-scene", () => ({
  Base3DScene: ({
    cameraPose,
    children,
    onCameraPoseChange,
    showGizmo = true,
    up = "z",
  }: {
    readonly cameraPose?: {
      readonly position: readonly [number, number, number];
      readonly target: readonly [number, number, number];
    } | null;
    readonly children?: ReactNode;
    readonly onCameraPoseChange?: (
      pose: {
        readonly position: readonly [number, number, number];
        readonly target: readonly [number, number, number];
      },
      source: "interaction",
    ) => void;
    readonly showGizmo?: boolean;
    readonly up?: "x" | "y" | "z";
  }) => (
    <div
      data-camera-pose={cameraPose ? JSON.stringify(cameraPose) : ""}
      data-testid="base-3d-scene"
      data-show-gizmo={String(showGizmo)}
      data-up-axis={up}
    >
      <button
        data-testid="camera-change"
        onClick={() =>
          onCameraPoseChange?.(
            {
              position: [7, 8, 9],
              target: [1, 2, 3],
            },
            "interaction",
          )
        }
        type="button"
      />
      {children}
    </div>
  ),
}));

vi.mock("../webgpu/webgpu-canvas", () => ({
  WebGpuCanvas: ({ children }: { readonly children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

beforeEach(() => {
  resetImageTextureCacheForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PointCloudPanel", () => {
  it("keeps point geometry local and applies the frame transform to a group", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const setAttribute = vi.spyOn(
      THREE.BufferGeometry.prototype,
      "setAttribute",
    );

    const { container } = render(
      <PointCloudPanel
        layers={[
          {
            frame: {
              fields: [],
              kind: VISUALIZATION_KIND.POINT_CLOUD,
              pointCount: 1,
              positions: new Float32Array([1, 2, 3]),
            },
            frameTransform: {
              rotation: new THREE.Quaternion(0, 0, 0, 1),
              sourceFrameId: "lidar",
              targetFrameId: "map",
              translation: new THREE.Vector3(10, 0, 0),
            },
            id: "/points",
          },
        ]}
        showHud={false}
      />,
    );

    const positionCall = setAttribute.mock.calls.find(
      ([attributeName]) => attributeName === "position",
    );
    const positionAttribute = positionCall?.[1] as
      | THREE.BufferAttribute
      | undefined;

    expect(positionAttribute).toBeDefined();
    // The persistent geometry is capacity-padded; the tick's points occupy
    // the draw-range prefix.
    expect(Array.from(positionAttribute?.array.slice(0, 3) ?? [])).toEqual([
      1, 2, 3,
    ]);

    const transformGroups = Array.from(container.querySelectorAll("group"));
    expect(transformGroups.at(-1)?.getAttribute("position")).toBe("10,0,0");
    expect(transformGroups.at(-1)?.getAttribute("quaternion")).toBe("0,0,0,1");
  });

  it("reuses one geometry across playback ticks within a capacity bucket", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const setAttribute = vi.spyOn(
      THREE.BufferGeometry.prototype,
      "setAttribute",
    );
    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");

    const layersFor = (positions: Float32Array, pointCount: number) => [
      {
        frame: {
          fields: [],
          kind: VISUALIZATION_KIND.POINT_CLOUD,
          pointCount,
          positions,
        },
        id: "/points",
      },
    ];

    const { rerender } = render(
      <PointCloudPanel
        layers={layersFor(new Float32Array([1, 2, 3]), 1)}
        showHud={false}
      />,
    );

    const positionCall = setAttribute.mock.calls.find(
      ([attributeName]) => attributeName === "position",
    );
    const positionAttribute = positionCall?.[1] as THREE.BufferAttribute;
    const attributeCallsAfterMount = setAttribute.mock.calls.length;

    rerender(
      <PointCloudPanel
        layers={layersFor(new Float32Array([4, 5, 6, 7, 8, 9]), 2)}
        showHud={false}
      />,
    );

    // Same capacity bucket: the tick lands in the existing attributes
    // instead of building (and disposing) a new geometry.
    expect(setAttribute.mock.calls.length).toBe(attributeCallsAfterMount);
    expect(dispose).not.toHaveBeenCalled();
    expect(Array.from(positionAttribute.array.slice(0, 6))).toEqual([
      4, 5, 6, 7, 8, 9,
    ]);
  });

  it("binds decoder render arrays directly and reuses them by content time", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const setAttribute = vi.spyOn(
      THREE.BufferGeometry.prototype,
      "setAttribute",
    );
    const firstSample = Float32Array.from([1, 2, 3, 4, 5, 6]);
    const redeliveredSample = Float32Array.from([7, 8, 9, 10, 11, 12]);

    const { rerender } = render(
      <PointCloudPanel
        layers={[gpuPointCloudLayer("/points", 10n, firstSample)]}
        maxRenderedPoints={1}
        showHud={false}
      />,
    );

    const directPositionAttribute = setAttribute.mock.calls.find(
      ([name, attribute]) =>
        name === "pointPosition" &&
        (attribute as THREE.BufferAttribute).array === firstSample,
    )?.[1] as THREE.BufferAttribute | undefined;
    expect(directPositionAttribute?.array).toBe(firstSample);
    // The local budget selects from the canonical payload in the shader;
    // it must not trigger a second sampling/copy pass.
    const attributeCallsAfterMount = setAttribute.mock.calls.length;
    const versionAfterMount = directPositionAttribute?.version;

    rerender(
      <PointCloudPanel
        layers={[gpuPointCloudLayer("/points", 10n, redeliveredSample)]}
        maxRenderedPoints={1}
        showHud={false}
      />,
    );
    expect(directPositionAttribute?.array).toBe(firstSample);
    expect(directPositionAttribute?.version).toBe(versionAfterMount);

    rerender(
      <PointCloudPanel
        layers={[gpuPointCloudLayer("/points", 11n, redeliveredSample)]}
        maxRenderedPoints={1}
        showHud={false}
      />,
    );
    expect(setAttribute.mock.calls.length).toBe(attributeCallsAfterMount);
    expect(directPositionAttribute?.array).toBe(redeliveredSample);
    expect(directPositionAttribute?.version).toBeGreaterThan(
      versionAfterMount ?? 0,
    );
  });

  it("keeps point size screen-space while updating the material size", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const layers = [
      {
        frame: {
          fields: [],
          kind: VISUALIZATION_KIND.POINT_CLOUD,
          pointCount: 1,
          positions: new Float32Array([1, 2, 3]),
        },
        id: "/points",
      },
    ];

    const { container, rerender } = render(
      <PointCloudPanel layers={layers} pointSize={2} showHud={false} />,
    );

    rerender(<PointCloudPanel layers={layers} pointSize={6} showHud={false} />);

    const material = container.querySelector("pointsMaterial");
    expect(POINT_CLOUD_POINTS_MATERIAL_PROPS.sizeAttenuation).toBe(false);
    expect(material?.getAttribute("size")).toBe("6");
  });

  it("can hide the scene gizmo for compact previews", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <PointCloudPanel
        layers={[
          {
            frame: {
              fields: [],
              kind: VISUALIZATION_KIND.POINT_CLOUD,
              pointCount: 1,
              positions: new Float32Array([1, 2, 3]),
            },
            id: "/points",
          },
        ]}
        showGizmo={false}
      />,
    );

    expect(
      screen.getByTestId("base-3d-scene").getAttribute("data-show-gizmo"),
    ).toBe("false");
  });

  it("passes the configured scene up-axis to the base scene", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<PointCloudPanel layers={[]} sceneUp="x" worldGrid={{}} />);

    expect(
      screen.getByTestId("base-3d-scene").getAttribute("data-up-axis"),
    ).toBe("x");
  });

  it("renders every layer in one scene with its own transform", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const setAttribute = vi.spyOn(
      THREE.BufferGeometry.prototype,
      "setAttribute",
    );

    const { container } = render(
      <PointCloudPanel
        layers={[
          {
            frame: {
              fields: [],
              kind: VISUALIZATION_KIND.POINT_CLOUD,
              pointCount: 1,
              positions: new Float32Array([1, 2, 3]),
            },
            id: "/lidar/top",
          },
          {
            frame: {
              fields: [],
              kind: VISUALIZATION_KIND.POINT_CLOUD,
              pointCount: 1,
              positions: new Float32Array([4, 5, 6]),
            },
            frameTransform: {
              rotation: new THREE.Quaternion(0, 0, 0, 1),
              sourceFrameId: "radar",
              targetFrameId: "map",
              translation: new THREE.Vector3(0, 7, 0),
            },
            id: "/radar/front",
          },
        ]}
        showHud={false}
      />,
    );

    const positionCalls = setAttribute.mock.calls.filter(
      ([attributeName]) => attributeName === "position",
    );
    expect(positionCalls).toHaveLength(2);

    const groups = Array.from(container.querySelectorAll("group"));
    expect(groups.map((g) => g.getAttribute("position"))).toEqual([
      "0,0,0",
      "0,7,0",
    ]);
  });

  it("renders scene annotation cubes in the shared 3D scene", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { container } = render(
      <PointCloudPanel
        annotationLayers={[
          {
            frame: {
              deletions: [],
              entities: [
                {
                  arrowCount: 0,
                  arrows: [],
                  cubeCount: 1,
                  cubes: [
                    {
                      color: [1, 0, 0, 0.8],
                      pose: {
                        position: [1, 2, 3],
                        quaternion: [0, 0, 0, 1],
                      },
                      size: [4, 5, 6],
                    },
                  ],
                  cylinderCount: 0,
                  cylinders: [],
                  frameId: "lidar",
                  frameLocked: false,
                  id: "box",
                  lineCount: 0,
                  lines: [],
                  metadata: {},
                  modelCount: 0,
                  models: [],
                  sphereCount: 0,
                  spheres: [],
                  textCount: 0,
                  texts: [],
                  triangleCount: 0,
                  triangles: [],
                },
              ],
              kind: VISUALIZATION_KIND.SCENE_UPDATE,
            },
            frameTransform: {
              rotation: new THREE.Quaternion(0, 0, 0, 1),
              sourceFrameId: "lidar",
              targetFrameId: "map",
              translation: new THREE.Vector3(10, 0, 0),
            },
            id: "/markers",
          },
        ]}
        layers={[]}
      />,
    );

    const groups = Array.from(container.querySelectorAll("group"));
    expect(groups.map((g) => g.getAttribute("position"))).toContain("10,0,0");
    expect(groups.map((g) => g.getAttribute("position"))).toContain("1,2,3");
    expect(screen.queryByText("No finite points")).toBeNull();
  });

  it("renders scene annotation lines without point-cloud layers", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { container } = render(
      <PointCloudPanel
        annotationLayers={[
          {
            frame: {
              deletions: [],
              entities: [
                {
                  arrowCount: 0,
                  arrows: [],
                  cubeCount: 0,
                  cubes: [],
                  cylinderCount: 0,
                  cylinders: [],
                  frameLocked: false,
                  id: "map-line",
                  lineCount: 1,
                  lines: [
                    {
                      color: [0, 1, 0, 1],
                      colors: [],
                      indices: [],
                      points: [
                        [0, 0, 0],
                        [1, 0, 0],
                      ],
                      pose: {
                        position: [0, 0, 0],
                        quaternion: [0, 0, 0, 1],
                      },
                      scaleInvariant: false,
                      thickness: 1,
                      type: "line-strip",
                    },
                  ],
                  metadata: {},
                  modelCount: 0,
                  models: [],
                  sphereCount: 0,
                  spheres: [],
                  textCount: 0,
                  texts: [],
                  triangleCount: 0,
                  triangles: [],
                },
              ],
              kind: VISUALIZATION_KIND.SCENE_UPDATE,
            },
            id: "/semantic_map",
          },
        ]}
        layers={[]}
      />,
    );

    expect(container.querySelector("linesegments")).toBeTruthy();
    expect(screen.queryByText("No finite points")).toBeNull();
  });

  it("renders grid layers as corner-anchored textured planes", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { container } = render(
      <PointCloudPanel
        gridLayers={[
          {
            contentTimeNs: 100n,
            frame: {
              cellSize: [0.5, 1],
              columnCount: 4,
              coordinateFrameId: "map",
              kind: VISUALIZATION_KIND.GRID,
              pose: {
                position: [920, 1300, 0],
                quaternion: [0, 0, 0, 1],
              },
              rgba: new Uint8Array(4 * 2 * 4),
              rowCount: 2,
            },
            frameTransform: {
              rotation: new THREE.Quaternion(0, 0, 0, 1),
              sourceFrameId: "map",
              targetFrameId: "base_link",
              translation: new THREE.Vector3(-900, -1280, 0),
            },
            id: "/map",
          },
        ]}
        layers={[]}
      />,
    );

    // 4 columns x 0.5m and 2 rows x 1m => a 2x2m plane whose center sits
    // half a size away from the pose's origin corner.
    const plane = container.querySelector("planegeometry");
    expect(plane?.getAttribute("args")).toBe("2,2");
    const mesh = container.querySelector("mesh");
    expect(mesh?.getAttribute("position")).toBe("1,1,0");
    expect(mesh?.getAttribute("renderOrder")).toBe("-1");

    const groups = Array.from(container.querySelectorAll("group"));
    expect(
      groups.some((group) => group.getAttribute("position") === "-900,-1280,0"),
    ).toBe(true);
    expect(
      groups.some((group) => group.getAttribute("position") === "920,1300,0"),
    ).toBe(true);

    // Grid-only scenes still get a fitted camera.
    expect(
      screen.getByTestId("base-3d-scene").getAttribute("data-camera-pose"),
    ).not.toBe("");
    expect(screen.queryByText("No finite points")).toBeNull();
  });

  it("orders coexisting grid planes under point clouds without widening camera bounds", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { container } = render(
      <PointCloudPanel
        gridLayers={[
          {
            frame: {
              cellSize: [100, 100],
              columnCount: 10,
              kind: VISUALIZATION_KIND.GRID,
              pose: {
                position: [0, 0, 0],
                quaternion: [0, 0, 0, 1],
              },
              rgba: new Uint8Array(10 * 10 * 4),
              rowCount: 10,
            },
            id: "/map",
          },
          {
            frame: {
              cellSize: [0.1, 0.1],
              columnCount: 2,
              kind: VISUALIZATION_KIND.GRID,
              pose: {
                position: [0, 0, 0],
                quaternion: [0, 0, 0, 1],
              },
              rgba: new Uint8Array(2 * 2 * 4),
              rowCount: 2,
            },
            id: "/drivable_area",
          },
        ]}
        layers={[
          {
            frame: {
              fields: [],
              kind: VISUALIZATION_KIND.POINT_CLOUD,
              pointCount: 1,
              positions: new Float32Array([1, 2, 3]),
            },
            id: "/points",
          },
        ]}
        showHud={false}
      />,
    );

    // Coplanar map layers draw in selection order beneath other content.
    const meshes = Array.from(container.querySelectorAll("mesh"));
    expect(meshes.map((mesh) => mesh.getAttribute("renderOrder"))).toEqual([
      "-2",
      "-1",
    ]);

    // The 1km map plane must not drag the camera fit away from the cloud.
    const cameraPose = JSON.parse(
      screen.getByTestId("base-3d-scene").getAttribute("data-camera-pose") ??
        "{}",
    ) as { readonly target?: readonly number[] };
    expect(cameraPose.target).toEqual([1, 2, 3]);
  });

  it("renders camera frustum wireframes without widening camera bounds", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const setAttribute = vi.spyOn(
      THREE.BufferGeometry.prototype,
      "setAttribute",
    );

    const { container } = render(
      <PointCloudPanel
        frustumLayers={[
          {
            contentTimeNs: 100n,
            frame: {
              height: 900,
              // fx=fy=450, cx=800, cy=450: corners scale linearly with
              // the fixed presentational frustum depth.
              K: [450, 0, 800, 0, 450, 450, 0, 0, 1],
              kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
              width: 1600,
            },
            frameTransform: {
              rotation: new THREE.Quaternion(0, 0, 0, 1),
              sourceFrameId: "CAM_FRONT",
              targetFrameId: "base_link",
              translation: new THREE.Vector3(100, 200, 1.5),
            },
            id: "/CAM_FRONT/camera_info",
          },
        ]}
        layers={[
          {
            frame: {
              fields: [],
              kind: VISUALIZATION_KIND.POINT_CLOUD,
              pointCount: 1,
              positions: new Float32Array([1, 2, 3]),
            },
            id: "/points",
          },
        ]}
        showHud={false}
      />,
    );

    expect(container.querySelector("linesegments")).toBeTruthy();
    const groups = Array.from(container.querySelectorAll("group"));
    expect(
      groups.some((group) => group.getAttribute("position") === "100,200,1.5"),
    ).toBe(true);

    // 4 apex rays + 4 far-rectangle edges = 8 segments = 16 vertices.
    const frustumPositions = setAttribute.mock.calls
      .map(([, attribute]) => attribute as THREE.BufferAttribute)
      .find((attribute) => attribute.array.length === 16 * 3);
    expect(frustumPositions).toBeDefined();
    const positions = Array.from(frustumPositions?.array ?? []);
    expect(positions[3]).toBeCloseTo((-800 / 450) * 2.75);
    expect(positions[4]).toBeCloseTo((-450 / 450) * 2.75);
    expect(positions[5]).toBeCloseTo(2.75);

    // The camera-local RGB marker contributes three thin axis segments.
    const axisPositions = setAttribute.mock.calls
      .filter(([attributeName]) => attributeName === "position")
      .map(([, attribute]) => attribute as THREE.BufferAttribute)
      .find((attribute) => attribute.array.length === 6 * 3);
    expect(axisPositions).toBeDefined();
    const axis = Array.from(axisPositions?.array ?? []);
    expect(axis.slice(0, 3)).toEqual([0, 0, 0]);
    expect(axis[3]).toBeCloseTo(2.75 * 0.28);
    expect(axis[4]).toBeCloseTo(0);
    expect(axis[5]).toBeCloseTo(0);
    expect(
      Array.from(container.querySelectorAll("linebasicmaterial")).some(
        (material) => material.getAttribute("linewidth") === "2",
      ),
    ).toBe(true);

    // The frustum at (100, 200) must not drag the camera fit off the cloud.
    const cameraPose = JSON.parse(
      screen.getByTestId("base-3d-scene").getAttribute("data-camera-pose") ??
        "{}",
    ) as { readonly target?: readonly number[] };
    expect(cameraPose.target).toEqual([1, 2, 3]);
  });

  it("renders transient scene rays without widening camera bounds", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const setAttribute = vi.spyOn(
      THREE.BufferGeometry.prototype,
      "setAttribute",
    );

    const { container } = render(
      <PointCloudPanel
        layers={[
          {
            frame: {
              fields: [],
              kind: VISUALIZATION_KIND.POINT_CLOUD,
              pointCount: 1,
              positions: new Float32Array([1, 2, 3]),
            },
            id: "/points",
          },
        ]}
        rayLayers={[
          {
            end: [0.1, 0.2, 4],
            frameTransform: {
              rotation: new THREE.Quaternion(),
              sourceFrameId: "camera",
              targetFrameId: "map",
              translation: new THREE.Vector3(100, 200, 300),
            },
            id: "depth-ray:/camera/depth",
            start: [0, 0, 0],
          },
        ]}
        showHud={false}
      />,
    );

    const rayPositions = setAttribute.mock.calls
      .filter(([attributeName]) => attributeName === "position")
      .map(([, attribute]) => attribute as THREE.BufferAttribute)
      .find((attribute) => attribute.array.length === 6);
    const rayValues = Array.from(rayPositions?.array ?? []);
    expect(rayValues.slice(0, 3)).toEqual([0, 0, 0]);
    expect(rayValues[3]).toBeCloseTo(0.1);
    expect(rayValues[4]).toBeCloseTo(0.2);
    expect(rayValues[5]).toBeCloseTo(4);
    expect(container.querySelector("points")).toBeTruthy();
    expect(
      Array.from(container.querySelectorAll("group")).some(
        (group) => group.getAttribute("position") === "100,200,300",
      ),
    ).toBe(true);

    const cameraPose = JSON.parse(
      screen.getByTestId("base-3d-scene").getAttribute("data-camera-pose") ??
        "{}",
    ) as { readonly target?: readonly number[] };
    expect(cameraPose.target).toEqual([1, 2, 3]);
  });

  it("applies custom camera frustum depth and base opacity", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const setAttribute = vi.spyOn(
      THREE.BufferGeometry.prototype,
      "setAttribute",
    );

    const { container } = render(
      <PointCloudPanel
        frustumLayers={[
          {
            frame: {
              height: 900,
              K: [450, 0, 800, 0, 450, 450, 0, 0, 1],
              kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
              width: 1600,
            },
            id: "/CAM_FRONT/camera_info",
            imagePlaneDepthM: 4,
            opacity: 0.42,
          },
        ]}
        layers={[]}
        showHud={false}
      />,
    );

    const frustumPositions = setAttribute.mock.calls
      .filter(([attributeName]) => attributeName === "position")
      .map(([, attribute]) => attribute as THREE.BufferAttribute)
      .find((attribute) => attribute.array.length === 16 * 3);
    expect(frustumPositions).toBeDefined();
    const positions = Array.from(frustumPositions?.array ?? []);
    expect(positions[3]).toBeCloseTo((-800 / 450) * 4);
    expect(positions[4]).toBeCloseTo((-450 / 450) * 4);
    expect(positions[5]).toBeCloseTo(4);

    const lineMaterials = Array.from(
      container.querySelectorAll("linebasicmaterial"),
    );
    expect(
      lineMaterials.some(
        (material) => material.getAttribute("opacity") === "0.42",
      ),
    ).toBe(true);
  });

  it("passes command-click state through camera frustum selection", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onSelect = vi.fn();

    const { container } = render(
      <PointCloudPanel
        frustumLayers={[
          {
            frame: {
              height: 900,
              K: [450, 0, 800, 0, 450, 450, 0, 0, 1],
              kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
              width: 1600,
            },
            id: "/CAM_FRONT/camera_info",
            onSelect,
          },
        ]}
        layers={[]}
        showHud={false}
      />,
    );

    const frustumGroup = container.querySelector("linesegments")?.parentElement;
    expect(frustumGroup).toBeTruthy();
    if (!frustumGroup) {
      throw new Error("Expected a rendered frustum group");
    }

    fireEvent.click(frustumGroup, { metaKey: false });
    fireEvent.click(frustumGroup, { metaKey: true });

    expect(onSelect).toHaveBeenNthCalledWith(1, { metaKey: false });
    expect(onSelect).toHaveBeenNthCalledWith(2, { metaKey: true });
  });

  it("decodes a keyed frustum image through the shared texture cache", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const createBitmap = vi.fn(async () => ({
      close: vi.fn(),
      height: 900,
      width: 1600,
    }));
    vi.stubGlobal("createImageBitmap", createBitmap);

    const frustumLayer = {
      contentTimeNs: 100n,
      frame: {
        height: 900,
        K: [450, 0, 800, 0, 450, 450, 0, 0, 1],
        kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
        width: 1600,
      },
      id: "/CAM_FRONT/camera_info",
      image: {
        bytes: new Uint8Array([1, 2, 3]),
        kind: VISUALIZATION_KIND.ENCODED_IMAGE,
      },
      imageContentTimeNs: 100n,
      imageTextureKey: "rec\n/CAM_FRONT/image\n100",
    };

    // Two panels showing the same keyed camera frame — e.g. the 3D tile
    // plus another surface — must collapse into a single decode.
    const { container } = render(
      <>
        <PointCloudPanel
          frustumLayers={[frustumLayer]}
          layers={[]}
          showHud={false}
        />
        <PointCloudPanel
          frustumLayers={[frustumLayer]}
          layers={[]}
          showHud={false}
        />
      </>,
    );

    // The textured image plane mesh appears once the decode lands.
    await waitFor(() =>
      expect(container.querySelectorAll("mesh").length).toBeGreaterThan(1),
    );

    expect(createBitmap).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats().decodeCount).toBe(1);
  });

  it("keeps the frustum visible and surfaces video decoder errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { container } = render(
      <PointCloudPanel
        frustumLayers={[
          {
            frame: {
              height: 1080,
              K: [700, 0, 720, 0, 700, 540, 0, 0, 1],
              kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
              width: 1440,
            },
            id: "/camera/front_right/camera_info",
            image: {
              bytes: new Uint8Array([0, 0, 0, 1, 0x61]),
              codec: "h264",
              format: "h264",
              h264: { hasFrame: true },
              keyframe: false,
              kind: VISUALIZATION_KIND.ENCODED_VIDEO,
              timestampNs: 100n,
            },
            imageContentTimeNs: 100n,
            imageTextureKey: "rec\n/camera/front_right/image\n100",
            imageStream: "/camera/front_right/image",
          },
        ]}
        layers={[]}
        showHud={false}
      />,
    );

    const noticeToggle = await screen.findByRole("button", {
      name: "1 scene notice",
    });
    expect(screen.queryByText("Waiting for H.264 keyframe")).toBeNull();
    expect(container.querySelector("linesegments")).toBeTruthy();
    expect(container.querySelector("mesh")).toBeNull();

    fireEvent.click(noticeToggle);
    expect(screen.getByText("Waiting for H.264 keyframe")).toBeTruthy();
    expect(screen.getByText("/camera/front_right/image")).toBeTruthy();
  });

  it("keeps the frustum visible when image geometry needs a user choice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = render(
      <PointCloudPanel
        frustumLayers={[
          {
            frame: {
              height: 1080,
              K: [700, 0, 720, 0, 700, 540, 0, 0, 1],
              kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
              width: 1440,
            },
            id: "/camera/front_right/camera_info",
            imageStream: "/camera/front_right/image_raw/compressed",
            imageUnavailableReason:
              "Original and rectified camera models differ; choose the image geometry",
          },
        ]}
        layers={[]}
        showHud={false}
      />,
    );

    expect(container.querySelector("linesegments")).toBeTruthy();
    const noticeToggle = await screen.findByRole("button", {
      name: "1 scene notice",
    });
    expect(
      screen.queryByText(
        "Original and rectified camera models differ; choose the image geometry",
      ),
    ).toBeNull();

    fireEvent.click(noticeToggle);
    expect(
      screen.getByText(
        "Original and rectified camera models differ; choose the image geometry",
      ),
    ).toBeTruthy();
  });

  it("renders the world reference grid only when opted in", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { container, rerender } = render(<PointCloudPanel layers={[]} />);
    expect(container.querySelector('mesh[name="world-grid"]')).toBeNull();

    rerender(<PointCloudPanel layers={[]} worldGrid={{}} />);
    expect(container.querySelector('mesh[name="world-grid"]')).not.toBeNull();
  });

  it("renders telemetry hud lines even without scene layers", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<PointCloudPanel hudLines={["6.5 m/s"]} layers={[]} />);

    expect(screen.getByText("6.5 m/s")).toBeTruthy();
  });

  it("passes controlled camera pose through to the base scene", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onCameraPoseChange = vi.fn();
    const cameraPose = {
      position: [1, 2, 3],
      target: [4, 5, 6],
    } as const;

    render(
      <PointCloudPanel
        cameraPose={cameraPose}
        layers={[
          {
            frame: {
              fields: [],
              kind: VISUALIZATION_KIND.POINT_CLOUD,
              pointCount: 1,
              positions: new Float32Array([1, 2, 3]),
            },
            id: "/points",
          },
        ]}
        onCameraPoseChange={onCameraPoseChange}
      />,
    );

    expect(
      screen.getByTestId("base-3d-scene").getAttribute("data-camera-pose"),
    ).toBe(JSON.stringify(cameraPose));

    fireEvent.click(screen.getByTestId("camera-change"));

    expect(onCameraPoseChange).toHaveBeenCalledWith(
      {
        position: [7, 8, 9],
        target: [1, 2, 3],
      },
      "interaction",
    );
  });

  it("collapses scene notices into a count chip that expands on demand", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <PointCloudPanel
        layers={[]}
        notices={[
          {
            detail: "radar_front",
            id: "transform:missing",
            message: "Missing transform to map",
            severity: "warning",
          },
          {
            detail: "lidar_top",
            id: "transform:clamped",
            message: "Using boundary-clamped transform to map",
            severity: "info",
          },
        ]}
        showColorLegend
      />,
    );

    expect(screen.queryByText(/boundary-clamped/)).toBeNull();

    fireEvent.click(screen.getByLabelText("2 scene notices"));

    expect(screen.getByText("Missing transform to map")).toBeTruthy();
    expect(screen.getByText("radar_front")).toBeTruthy();
    expect(
      screen.getByText("Using boundary-clamped transform to map"),
    ).toBeTruthy();
    expect(screen.getByText("lidar_top")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("2 scene notices"));
    expect(screen.queryByText(/boundary-clamped/)).toBeNull();
  });

  it("keeps notice rows keyed by id so detail churn edits in place", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const notice = (detail: string) => ({
      detail,
      id: "transform:clamped",
      message: "Using boundary-clamped transform to map",
      severity: "info" as const,
    });
    const { rerender } = render(
      <PointCloudPanel layers={[]} notices={[notice("lidar_top")]} />,
    );

    fireEvent.click(screen.getByLabelText("1 scene notice"));
    const row = screen.getByText("lidar_top").closest("li");
    expect(row).toBeTruthy();

    rerender(
      <PointCloudPanel
        layers={[]}
        notices={[notice("lidar_top, radar_front")]}
      />,
    );

    // Same <li> element: the id-keyed row updated in place instead of
    // remounting when its detail text changed.
    expect(screen.getByText("lidar_top, radar_front").closest("li")).toBe(row);
    expect(screen.getByLabelText("1 scene notice")).toBeTruthy();
  });

  it("renders no notices chip without notices", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<PointCloudPanel layers={[]} />);

    expect(screen.queryByLabelText(/scene notice/)).toBeNull();
  });

  it("uses an automatic camera pose unless fitting is disabled", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const layer = {
      frame: {
        fields: [],
        kind: VISUALIZATION_KIND.POINT_CLOUD,
        pointCount: 2,
        positions: new Float32Array([0, 0, 0, 10, 0, 0]),
      },
      id: "/points",
    } as const;

    const { rerender } = render(
      <PointCloudPanel fit="never" layers={[layer]} />,
    );
    expect(
      screen.getByTestId("base-3d-scene").getAttribute("data-camera-pose"),
    ).toBe("");

    rerender(<PointCloudPanel fit="initial" layers={[layer]} />);
    expect(
      screen.getByTestId("base-3d-scene").getAttribute("data-camera-pose"),
    ).not.toBe("");
  });

  it("re-captures the initial fit when the fit reset key changes", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const layerAt = (x: number) =>
      ({
        frame: {
          fields: [],
          kind: VISUALIZATION_KIND.POINT_CLOUD,
          pointCount: 2,
          positions: new Float32Array([x, 0, 0, x + 10, 0, 0]),
        },
        id: "/points",
      }) as const;

    const { rerender } = render(
      <PointCloudPanel fitResetKey="base_link" layers={[layerAt(0)]} />,
    );
    const firstPose = screen
      .getByTestId("base-3d-scene")
      .getAttribute("data-camera-pose");
    expect(firstPose).not.toBe("");

    // Same key: the captured initial fit survives content movement.
    rerender(
      <PointCloudPanel fitResetKey="base_link" layers={[layerAt(100)]} />,
    );
    expect(
      screen.getByTestId("base-3d-scene").getAttribute("data-camera-pose"),
    ).toBe(firstPose);

    // New key (a world-frame change): the stale fit would frame coordinates
    // from the old frame, so it re-captures from the re-placed layers.
    rerender(<PointCloudPanel fitResetKey="map" layers={[layerAt(100)]} />);
    expect(
      screen.getByTestId("base-3d-scene").getAttribute("data-camera-pose"),
    ).not.toBe(firstPose);
  });

  it("recenters on the current scene through the focus channel", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onCameraPoseChange = vi.fn();

    render(
      <PointCloudPanel
        cameraPose={{ position: [500, 500, 500], target: [400, 400, 400] }}
        layers={[
          {
            frame: {
              fields: [],
              kind: VISUALIZATION_KIND.POINT_CLOUD,
              pointCount: 2,
              positions: new Float32Array([0, 0, 0, 10, 0, 0]),
            },
            id: "/points",
          },
        ]}
        onCameraPoseChange={onCameraPoseChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Recenter view"));

    expect(onCameraPoseChange).toHaveBeenCalledTimes(1);
    const [fitPose, source] = onCameraPoseChange.mock.calls[0];
    expect(source).toBe("focus");
    // The fit centers on the layer bounds, not the stranded controlled pose.
    expect(fitPose.target[0]).toBeCloseTo(5);
    expect(fitPose.target[1]).toBeCloseTo(0);
    expect(fitPose.target[2]).toBeCloseTo(0);
  });

  it("arms the measurement tool and walks the readout through the picks", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <PointCloudPanel
        layers={[
          {
            frame: {
              fields: [],
              kind: VISUALIZATION_KIND.POINT_CLOUD,
              pointCount: 2,
              positions: new Float32Array([0, 0, 0, 10, 0, 0]),
            },
            id: "/points",
          },
        ]}
      />,
    );

    const toggle = screen.getByLabelText("Measure distance");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("measure-readout")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("measure-readout").textContent).toBe(
      "Pick two grid points",
    );

    // Escape steps the tool back: with no measurement it disarms.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("measure-readout")).toBeNull();
  });

  it("renders caller controls without requiring fit bounds", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <PointCloudPanel
        controls={<button aria-label="Camera preset" type="button" />}
        layers={[]}
      />,
    );

    expect(screen.getByLabelText("Camera preset")).toBeTruthy();
    expect(screen.queryByLabelText("Recenter view")).toBeNull();
    expect(screen.queryByLabelText("Measure distance")).toBeNull();
  });

  it("hides the interactive controls when showControls is off (grid previews)", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <PointCloudPanel
        controls={<button aria-label="Camera preset" type="button" />}
        layers={[
          {
            frame: {
              fields: [],
              kind: VISUALIZATION_KIND.POINT_CLOUD,
              pointCount: 2,
              positions: new Float32Array([0, 0, 0, 10, 0, 0]),
            },
            id: "/points",
          },
        ]}
        showControls={false}
      />,
    );

    expect(screen.queryByLabelText("Recenter view")).toBeNull();
    expect(screen.queryByLabelText("Measure distance")).toBeNull();
    expect(screen.queryByLabelText("Camera preset")).toBeNull();
  });

  it("keeps the no-finite-points status for partially finite layers off", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <PointCloudPanel
        layers={[
          {
            frame: {
              fields: [],
              kind: VISUALIZATION_KIND.POINT_CLOUD,
              pointCount: 3,
              positions: new Float32Array([0, 0, 0, 1, 1, 1, NaN, 0, 0]),
            },
            id: "/points",
          },
        ]}
      />,
    );

    expect(screen.queryByText("No finite points")).toBeNull();
  });

  it("defaults to explicit point colors before derived values", () => {
    expectArrayCloseTo(
      renderPointCloudColors({
        colors: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]),
        positions: new Float32Array([0, 0, 0, 0, 0, 10]),
        scalarFields: [{ name: "rcs", values: new Float32Array([10, 20]) }],
      }),
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    );
  });

  it("defaults to canonical sensor-return scalars before height", () => {
    expectArrayCloseTo(
      renderPointCloudColors({
        positions: new Float32Array([0, 0, 100, 0, 0, 0]),
        scalarFields: [{ name: "rcs", values: new Float32Array([10, 20]) }],
      }),
      [0.25, 0.55, 1, 1, 0.9, 0.52],
    );
  });

  it("can force height coloring with colorBy", () => {
    expectArrayCloseTo(
      renderPointCloudColors({
        colorBy: "height",
        colors: new Float32Array([1, 0, 0, 1, 0, 0]),
        positions: new Float32Array([0, 0, 0, 0, 0, 10]),
      }),
      [0.25, 0.55, 1, 1, 0.9, 0.52],
    );
  });

  it("uses a neutral color when no source has useful variation", () => {
    expectArrayCloseTo(
      renderPointCloudColors({
        positions: new Float32Array([0, 0, 3, 1, 1, 3]),
      }),
      [0.72, 0.76, 0.82, 0.72, 0.76, 0.82],
    );
  });

  it("uses the requested uniform color for explicit uniform coloring", () => {
    expectArrayCloseTo(
      renderPointCloudColors({
        colorSettings: { colorBy: "uniform", uniformColor: "#336699" },
        positions: new Float32Array([0, 0, 3, 1, 1, 3]),
      }),
      [0.2, 0.4, 0.6, 0.2, 0.4, 0.6],
    );
  });

  it("colors by any requested scalar channel through layer settings", () => {
    // "ring" is not a canonical sensor-return channel; selecting it by
    // name (case/punctuation-insensitive) drives the ramp.
    expectArrayCloseTo(
      renderPointCloudColors({
        colorSettings: { colorBy: "Ring" },
        positions: new Float32Array([0, 0, 0, 0, 0, 10]),
        scalarFields: [
          { name: "intensity", values: new Float32Array([5, 5]) },
          { name: "ring", values: new Float32Array([0, 31]) },
        ],
      }),
      [0.25, 0.55, 1, 1, 0.9, 0.52],
    );
  });

  it("applies the requested colormap to the ramp", () => {
    const [lowR, lowG, lowB] = sampleColormap("viridis", 0);
    const [highR, highG, highB] = sampleColormap("viridis", 1);
    expectArrayCloseTo(
      renderPointCloudColors({
        colorSettings: { colorBy: "height", colormap: "viridis" },
        positions: new Float32Array([0, 0, 0, 0, 0, 10]),
      }),
      [lowR, lowG, lowB, highR, highG, highB],
    );
  });

  it("normalizes against a fixed range and clamps values outside it", () => {
    // Range 0..5: the 2.5 value sits mid-ramp, the 10 value clamps to the
    // top even though the frame's own max is 10.
    const [midR, midG, midB] = sampleColormap("coolwarm", 0.5);
    const [highR, highG, highB] = sampleColormap("coolwarm", 1);
    expectArrayCloseTo(
      renderPointCloudColors({
        colorSettings: { colorBy: "intensity", rangeMax: 5, rangeMin: 0 },
        positions: new Float32Array([0, 0, 0, 0, 0, 1]),
        scalarFields: [
          { name: "intensity", values: new Float32Array([2.5, 10]) },
        ],
      }),
      [midR, midG, midB, highR, highG, highB],
    );
  });

  it("lets a constant-valued channel ramp under a fixed range", () => {
    // Without the fixed range a zero-spread channel falls back to neutral;
    // the explicit range anchors it on the ramp instead.
    const [r, g, b] = sampleColormap("coolwarm", 0.5);
    expectArrayCloseTo(
      renderPointCloudColors({
        colorSettings: { colorBy: "intensity", rangeMax: 10, rangeMin: 0 },
        positions: new Float32Array([0, 0, 0, 0, 0, 1]),
        scalarFields: [{ name: "intensity", values: new Float32Array([5, 5]) }],
      }),
      [r, g, b, r, g, b],
    );
  });

  it("shows a legend for active ramps and dedupes identical ones", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <PointCloudPanel
        layers={[
          pointCloudLayer("/lidar/a", {
            scalarFields: [
              { name: "intensity", values: new Float32Array([0, 100]) },
            ],
          }),
          pointCloudLayer("/lidar/b", {
            scalarFields: [
              { name: "intensity", values: new Float32Array([0, 100]) },
            ],
          }),
          pointCloudLayer("/radar", {
            colorSettings: { colorBy: "vx", colormap: "turbo" },
            scalarFields: [{ name: "vx", values: new Float32Array([-8, 8]) }],
          }),
        ]}
        showColorLegend
      />,
    );

    const legend = screen.getByTestId("point-cloud-color-legend");
    // The twin lidar ramps collapse into one entry; the radar ramp stays.
    expect(legend.textContent).toContain("intensity");
    expect(legend.textContent).toContain("vx");
    expect(legend.textContent).toContain("100");
    expect(legend.textContent).toContain("-8");
    expect(
      Array.from(legend.children).filter((child) =>
        child.textContent?.includes("intensity"),
      ),
    ).toHaveLength(1);
  });

  it("shows no legend for uniform or rgb coloring", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <PointCloudPanel
        layers={[
          pointCloudLayer("/rgb", {
            colors: new Float32Array([1, 0, 0, 0, 1, 0]),
          }),
          pointCloudLayer("/uniform", {
            colorSettings: { colorBy: "uniform" },
          }),
        ]}
        showColorLegend
      />,
    );

    expect(screen.queryByTestId("point-cloud-color-legend")).toBeNull();
  });

  it("hides the legend by default", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <PointCloudPanel
        layers={[
          pointCloudLayer("/lidar", {
            scalarFields: [
              { name: "intensity", values: new Float32Array([0, 100]) },
            ],
          }),
        ]}
      />,
    );

    expect(screen.queryByTestId("point-cloud-color-legend")).toBeNull();
  });

  it("can show the legend while the telemetry hud is off", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <PointCloudPanel
        layers={[
          pointCloudLayer("/lidar", {
            scalarFields: [
              { name: "intensity", values: new Float32Array([0, 100]) },
            ],
          }),
        ]}
        showColorLegend
        showHud={false}
      />,
    );

    expect(screen.getByTestId("point-cloud-color-legend")).toBeTruthy();
  });

  it("prefers layer color settings over the panel-level colorBy", () => {
    expectArrayCloseTo(
      renderPointCloudColors({
        colorBy: "height",
        colorSettings: { colorBy: "uniform" },
        positions: new Float32Array([0, 0, 0, 0, 0, 10]),
      }),
      [0.72, 0.76, 0.82, 0.72, 0.76, 0.82],
    );
  });
});

function pointCloudLayer(
  id: string,
  {
    colorSettings,
    colors,
    scalarFields,
  }: {
    readonly colorSettings?: PointCloudColorSettings;
    readonly colors?: Float32Array;
    readonly scalarFields?: readonly {
      readonly name: string;
      readonly values: Float32Array;
    }[];
  } = {},
) {
  const positions = new Float32Array([0, 0, 0, 1, 1, 1]);
  return {
    ...(colorSettings ? { colorSettings } : {}),
    frame: {
      ...(colors ? { colors } : {}),
      ...(scalarFields ? { scalarFields } : {}),
      fields: [],
      kind: VISUALIZATION_KIND.POINT_CLOUD,
      pointCount: Math.floor(positions.length / 3),
      positions,
    },
    id,
  };
}

function gpuPointCloudLayer(
  id: string,
  contentTimeNs: bigint,
  sampledPositions: Float32Array,
) {
  const pointCount = Math.floor(sampledPositions.length / 3);
  return {
    contentTimeNs,
    frame: {
      fields: [],
      kind: VISUALIZATION_KIND.POINT_CLOUD,
      pointCount,
      positions: sampledPositions,
      renderPayload: {
        bounds: {
          max: [
            sampledPositions[3] ?? sampledPositions[0],
            sampledPositions[4] ?? sampledPositions[1],
            sampledPositions[5] ?? sampledPositions[2],
          ] as const,
          min: [
            sampledPositions[0],
            sampledPositions[1],
            sampledPositions[2],
          ] as const,
        },
        capacity: pointCount,
        colors: Float32Array.from([1, 0, 0, 0, 1, 0]),
        finitePointCount: pointCount,
        heightRange: {
          max: sampledPositions[5] ?? sampledPositions[2],
          min: sampledPositions[2],
        },
        positions: sampledPositions,
        sampledPointCount: pointCount,
        scalarFields: [],
        sourceIndices: Uint32Array.from(
          { length: pointCount },
          (_, index) => index,
        ),
      },
    },
    id,
  };
}

function renderPointCloudColors({
  colorBy,
  colorSettings,
  colors,
  positions,
  scalarFields,
}: {
  readonly colorBy?: "height";
  readonly colorSettings?: PointCloudColorSettings;
  readonly colors?: Float32Array;
  readonly positions: Float32Array;
  readonly scalarFields?: readonly {
    readonly name: string;
    readonly values: Float32Array;
  }[];
}) {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const setAttribute = vi.spyOn(THREE.BufferGeometry.prototype, "setAttribute");

  render(
    <PointCloudPanel
      colorBy={colorBy}
      layers={[
        {
          ...(colorSettings ? { colorSettings } : {}),
          frame: {
            ...(colors ? { colors } : {}),
            ...(scalarFields ? { scalarFields } : {}),
            fields: [],
            kind: VISUALIZATION_KIND.POINT_CLOUD,
            pointCount: Math.floor(positions.length / 3),
            positions,
          },
          id: "/points",
        },
      ]}
      showHud={false}
    />,
  );

  const colorCall = setAttribute.mock.calls.find(
    ([attributeName]) => attributeName === "color",
  );
  const colorAttribute = colorCall?.[1] as THREE.BufferAttribute | undefined;

  // The persistent geometry is capacity-padded; the tick's colors occupy
  // the draw-range prefix.
  return Array.from(colorAttribute?.array.slice(0, positions.length) ?? []);
}

function expectArrayCloseTo(
  actual: readonly number[],
  expected: readonly number[],
) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index]);
  });
}
