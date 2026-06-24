import { render } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { Quaternion, Vector3 } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fos from "@fiftyone/state";
import { Fo3dSceneContent } from "../Fo3dCanvas";
import type { FoScene } from "../render-types";

const threeDLabelsMock = vi.fn((_: { sampleMap: unknown }) => null);
const orbitControlsMock = vi.fn((_: Record<string, unknown>) => null);

vi.mock("@fiftyone/state", () => ({
  modalMode: { key: "modalMode" },
  useRenderConfig3dState: vi.fn(),
}));

vi.mock("recoil", () => ({}));

vi.mock("jotai", () => ({
  useAtomValue: vi.fn(),
}));

vi.mock("@react-three/drei", () => ({
  AdaptiveDpr: () => null,
  AdaptiveEvents: () => null,
  OrbitControls: (props: Record<string, unknown>) => orbitControlsMock(props),
  PerspectiveCamera: () => null,
}));

vi.mock("../../SpinningCube", () => ({
  SpinningCube: () => null,
}));

vi.mock("../../annotation/AnnotationPlane", () => ({
  AnnotationPlane: () => null,
}));

vi.mock("../../annotation/CreateCuboidRenderer", () => ({
  CreateCuboidRenderer: () => null,
}));

vi.mock("../../annotation/Crosshair3D", () => ({
  Crosshair3D: () => null,
}));

vi.mock("../../annotation/SegmentPolylineRenderer", () => ({
  SegmentPolylineRenderer: () => null,
}));

vi.mock("../../constants", () => ({
  PANEL_ID_MAIN: "main",
}));

vi.mock("../../frustum", () => ({
  FrustumCollection: () => null,
}));

vi.mock("../../hooks/use-camera-views", () => ({
  useCameraViews: () => null,
}));

vi.mock("../../labels", () => ({
  ThreeDLabels: (props: { sampleMap: unknown }) => {
    threeDLabelsMock(props);
    return null;
  },
}));

vi.mock("../../services/RaycastService", () => ({
  RaycastService: () => null,
}));

vi.mock("../FoScene", () => ({
  FoSceneComponent: () => null,
}));

const fo3dPerformanceMonitorMock = vi.fn(() => null);

vi.mock("../Fo3dPerformanceMonitor", () => ({
  Fo3dPerformanceMonitor: () => fo3dPerformanceMonitorMock(),
}));

vi.mock("../Gizmos", () => ({
  Gizmos: () => null,
}));

vi.mock("../scene-controls/SceneControls", () => ({
  SceneControls: () => null,
}));

describe("Fo3dSceneContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAtomValue).mockReturnValue("explore");
  });

  it("renders labels from the active 3d slice sample map", () => {
    const labelSampleMap = {
      pcd_left: {
        sample: { _id: "left-sample", filepath: "/tmp/left.pcd" },
      },
      pcd_right: {
        sample: { _id: "right-sample", filepath: "/tmp/right.pcd" },
      },
    } as unknown as ReturnType<
      typeof fos.useRenderConfig3dState
    >["activeSampleMap"];

    vi.mocked(fos.useRenderConfig3dState).mockReturnValue({
      activeSampleMap: labelSampleMap,
    } as ReturnType<typeof fos.useRenderConfig3dState>);

    const foScene: FoScene = {
      position: new Vector3(0, 0, 0),
      quaternion: new Quaternion(),
      scale: new Vector3(1, 1, 1),
      background: null,
      cameraProps: {
        position: null,
        lookAt: null,
        up: "Y",
        fov: 50,
        aspect: 1,
        near: 0.1,
        far: 2500,
      },
      lights: [],
      children: [],
    };
    render(
      <Fo3dSceneContent
        cameraPosition={new Vector3(0, 0, 5)}
        upVector={new Vector3(0, 1, 0)}
        autoRotate={false}
        cameraControlsRef={{ current: null }}
        foScene={foScene}
        isSceneInitialized={true}
        assetsGroupRef={{ current: null }}
        cameraRef={{ current: null }}
      />,
    );

    expect(threeDLabelsMock).toHaveBeenCalledTimes(1);
    expect(threeDLabelsMock.mock.calls[0][0]).toMatchObject({
      sampleMap: labelSampleMap,
    });
    expect(fo3dPerformanceMonitorMock).toHaveBeenCalledTimes(1);
    expect(orbitControlsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rotateSpeed: 1,
        zoomSpeed: 0.6,
        panSpeed: 1.15,
      })
    );
  });
});
