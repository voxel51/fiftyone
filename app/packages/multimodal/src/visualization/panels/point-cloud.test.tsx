import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { VISUALIZATION_KIND } from "../visualization-registry";
import { PointCloudPanel } from "./point-cloud";

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { invalidate: () => void }) => unknown) =>
    selector({ invalidate: vi.fn() }),
}));

vi.mock("./base-3d-scene", () => ({
  Base3DScene: ({
    cameraPose,
    children,
    focusSceneRequestKey,
    onCameraPoseChange,
    showGizmo = true,
  }: {
    readonly cameraPose?: {
      readonly position: readonly [number, number, number];
      readonly target: readonly [number, number, number];
    } | null;
    readonly children?: ReactNode;
    readonly focusSceneRequestKey?: number;
    readonly onCameraPoseChange?: (
      pose: {
        readonly position: readonly [number, number, number];
        readonly target: readonly [number, number, number];
      },
      source: "interaction",
    ) => void;
    readonly showGizmo?: boolean;
  }) => (
    <div
      data-camera-pose={cameraPose ? JSON.stringify(cameraPose) : ""}
      data-focus-scene-request-key={focusSceneRequestKey ?? ""}
      data-testid="base-3d-scene"
      data-show-gizmo={String(showGizmo)}
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

vi.mock("./webgpu-canvas", () => ({
  WebGpuCanvas: ({ children }: { readonly children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
    expect(Array.from(positionAttribute?.array ?? [])).toEqual([1, 2, 3]);

    const transformGroups = Array.from(container.querySelectorAll("group"));
    expect(transformGroups.at(-1)?.getAttribute("position")).toBe("10,0,0");
    expect(transformGroups.at(-1)?.getAttribute("quaternion")).toBe("0,0,0,1");
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
                  frameId: "lidar",
                  frameLocked: false,
                  id: "box",
                  lineCount: 0,
                  metadata: {},
                  modelCount: 0,
                  sphereCount: 0,
                  textCount: 0,
                  triangleCount: 0,
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
    expect(screen.getByText("1 box")).toBeTruthy();
    expect(screen.queryByText("No finite points")).toBeNull();
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

  it("can request camera focus on the visible 3D scene", () => {
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
      />,
    );

    expect(
      screen
        .getByTestId("base-3d-scene")
        .getAttribute("data-focus-scene-request-key"),
    ).toBe("");

    fireEvent.click(screen.getByLabelText("Focus camera on visible 3D data"));

    expect(
      screen
        .getByTestId("base-3d-scene")
        .getAttribute("data-focus-scene-request-key"),
    ).toBe("1");
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

  it("renders finite point totals from current layer data immediately", () => {
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
    expect(screen.getByText("2 / 3 pts")).toBeTruthy();
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
});

function renderPointCloudColors({
  colorBy,
  colors,
  positions,
  scalarFields,
}: {
  readonly colorBy?: "height";
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

  return Array.from(colorAttribute?.array ?? []);
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
