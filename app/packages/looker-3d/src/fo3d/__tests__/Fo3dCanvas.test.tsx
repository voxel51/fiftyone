import { render } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { Quaternion, Vector3 } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fos from "@fiftyone/state";
import { MAIN_PANEL_ORBIT_ZOOM_SPEED } from "../../utils/side-panel-camera-sync";
import {
  MAIN_PANEL_CAMERA_TARGET_EPSILON,
  MAIN_PANEL_ORBIT_PAN_SPEED,
} from "../../utils/main-panel-orbit-controls";
import { Fo3dSceneContent } from "../Fo3dCanvas";
import type { FoScene } from "../render-types";

const threeDLabelsMock = vi.fn((_: { sampleMap: unknown }) => null);
const orbitControlsMock = vi.fn((_: Record<string, unknown>) => null);
const frustumCollectionMock = vi.fn(
  (_: { isSceneInitialized?: boolean }) => null,
);

vi.mock("@fiftyone/state", () => ({
  ModalMode: {
    ANNOTATE: "annotate",
    EXPLORE: "explore",
  },
  modalMode: { key: "modalMode" },
  useRenderConfig3dState: vi.fn(),
}));

vi.mock("recoil", () => ({
  useRecoilValue: vi.fn(() => null),
  useSetRecoilState: vi.fn(() => vi.fn()),
}));

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
  DEFAULT_SELECTED_CUBOID_CROP_MARGIN: 1,
  PANEL_ID_MAIN: "main",
}));

vi.mock("../../frustum", () => ({
  FrustumCollection: (props: { isSceneInitialized?: boolean }) =>
    frustumCollectionMock(props),
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

vi.mock("../../state", () => ({
  activeCursorPanelAtom: {},
  mainPanelPanSyncIntentAtom: {},
  mainPanelZoomSyncIntentAtom: {},
  raycastResultAtom: {},
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAtomValue).mockReturnValue(fos.ModalMode.EXPLORE);
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
    expect(frustumCollectionMock).toHaveBeenCalledWith({
      isSceneInitialized: true,
    });
    expect(orbitControlsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rotateSpeed: 1,
        zoomSpeed: MAIN_PANEL_ORBIT_ZOOM_SPEED,
        panSpeed: MAIN_PANEL_ORBIT_PAN_SPEED,
        minDistance: MAIN_PANEL_CAMERA_TARGET_EPSILON,
      }),
    );
  });

  it("mounts frustum collection before scene content is initialized", () => {
    vi.mocked(fos.useRenderConfig3dState).mockReturnValue({
      activeSampleMap: {},
    } as ReturnType<typeof fos.useRenderConfig3dState>);

    render(
      <Fo3dSceneContent
        cameraPosition={new Vector3(0, 0, 5)}
        upVector={new Vector3(0, 1, 0)}
        autoRotate={false}
        cameraControlsRef={{ current: null }}
        foScene={foScene}
        isSceneInitialized={false}
        assetsGroupRef={{ current: null }}
        cameraRef={{ current: null }}
      />,
    );

    expect(threeDLabelsMock).not.toHaveBeenCalled();
    expect(frustumCollectionMock).toHaveBeenCalledWith({
      isSceneInitialized: false,
    });
  });
});
