import { create } from "@bufbuild/protobuf";
import type { SampleRendererProps } from "@fiftyone/plugins";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Quaternion, Vector3 } from "three";
import { StreamInventorySchema } from "../../../schemas/v1";
import { VISUALIZATION_KIND } from "../../../visualization";
import type { PointCloudPanelProps } from "../../../visualization/panels/point-cloud";
import { McapFrameTransformStore } from "../frame-transforms";
import { MCAP_ACTIVE_TIMELINE } from "../types";
import { ModalRenderer } from "./ModalRenderer";

const hookMocks = vi.hoisted(() => ({
  useMcapPlayback: vi.fn(),
  useMcapFrameTransforms: vi.fn(),
  useMcapResourceClient: vi.fn(),
  useMcapTopics: vi.fn(),
  useStableMcapSource: vi.fn(),
}));

const panelMocks = vi.hoisted(() => ({
  ImagePanel: vi.fn(() => null),
  PointCloudPanel: vi.fn((_props: PointCloudPanelProps) => null),
}));

vi.mock("../../../visualization/panels/image", () => ({
  ImagePanel: panelMocks.ImagePanel,
}));

vi.mock("../../../visualization/panels/point-cloud", () => ({
  PointCloudPanel: panelMocks.PointCloudPanel,
}));

vi.mock("./playback-poc", () => ({
  useMcapPlayback: hookMocks.useMcapPlayback,
}));

vi.mock("./use-mcap-resource-client", () => ({
  useMcapResourceClient: hookMocks.useMcapResourceClient,
}));

vi.mock("./use-mcap-frame-transforms", () => ({
  useMcapFrameTransforms: hookMocks.useMcapFrameTransforms,
}));

vi.mock("./use-mcap-topics", () => ({
  useMcapTopics: hookMocks.useMcapTopics,
}));

vi.mock("./use-stable-mcap-source", () => ({
  useStableMcapSource: hookMocks.useStableMcapSource,
}));

afterEach(() => {
  cleanup();
});

describe("ModalRenderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookMocks.useMcapResourceClient.mockReturnValue({});
    hookMocks.useStableMcapSource.mockReturnValue({
      sourceId: "sample",
      url: "memory://sample.mcap",
    });
    hookMocks.useMcapTopics.mockReturnValue({
      error: null,
      status: "ready",
      topics: [
        create(StreamInventorySchema, {
          displayName: "Hydrated top lidar",
          metadata: {
            "mcap.channel_metadata.frame_id": "lidar_top",
            "mcap.topic": "/LIDAR_TOP",
          },
          payload: {
            encoding: "protobuf",
            schema: "foxglove.PointCloud",
            schemaEncoding: "protobuf",
          },
          recordCount: "5",
          streamId: "9",
        }),
      ],
    });
    hookMocks.useMcapFrameTransforms.mockReturnValue({
      error: null,
      frameIds: ["base_link", "lidar_top"],
      resolve: createTransformResolver([transform("base_link", "lidar_top")]),
      status: "ready",
    });
    hookMocks.useMcapPlayback.mockReturnValue({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      bufferStatus: {
        bufferedFrameCount: 0,
        loadingFrameCount: 0,
        segments: [],
        totalFrameCount: 1,
      },
      canPlay: false,
      displayMessagesByTopic: {
        "/LIDAR_TOP": createPointCloudMessage(),
      },
      error: null,
      frameIndex: 0,
      frameStatus: "ready",
      isPlaying: false,
      relativeTimeNs: 0n,
      seekFrame: vi.fn(),
      selectActiveTimeline: vi.fn(),
      timeNs: 0n,
      timelineStatus: "ready",
      timelineTickCount: 1,
      togglePlaying: vi.fn(),
    });
  });

  it("uses hydrated stream coordinate frame as the point-cloud source fallback", () => {
    render(<ModalRenderer ctx={{} as SampleRendererProps["ctx"]} />);

    expect(screen.getAllByText("Hydrated top lidar")).toHaveLength(2);
    expect(screen.getByText("/LIDAR_TOP · lidar_top")).toBeTruthy();
    expect(screen.getByText("9 · lidar_top")).toBeTruthy();

    const pointCloudProps = panelMocks.PointCloudPanel.mock.calls[0]?.[0];
    if (!pointCloudProps) {
      throw new Error("Expected PointCloudPanel to render");
    }

    expect(pointCloudProps.frameTransform).toMatchObject({
      sourceFrameId: "lidar_top",
      targetFrameId: "base_link",
    });
  });

  it("prefers decoded point-cloud frame over hydrated stream fallback", () => {
    hookMocks.useMcapPlayback.mockReturnValue({
      ...hookMocks.useMcapPlayback(),
      displayMessagesByTopic: {
        "/LIDAR_TOP": createPointCloudMessage("message_lidar"),
      },
    });
    hookMocks.useMcapFrameTransforms.mockReturnValue({
      error: null,
      frameIds: ["base_link", "lidar_top", "message_lidar"],
      resolve: createTransformResolver([
        transform("base_link", "lidar_top"),
        transform("base_link", "message_lidar"),
      ]),
      status: "ready",
    });

    render(<ModalRenderer ctx={{} as SampleRendererProps["ctx"]} />);

    const pointCloudProps = panelMocks.PointCloudPanel.mock.calls[0]?.[0];
    expect(pointCloudProps?.frameTransform).toMatchObject({
      sourceFrameId: "message_lidar",
      targetFrameId: "base_link",
    });
  });

  it("uses static transforms for immediate ego-frame placement before dynamic indexing", () => {
    hookMocks.useMcapFrameTransforms.mockReturnValue({
      error: null,
      frameIds: ["base_link", "lidar_top"],
      resolve: createTransformResolver([transform("base_link", "lidar_top")]),
      status: "ready",
    });

    render(<ModalRenderer ctx={{} as SampleRendererProps["ctx"]} />);

    const pointCloudProps = panelMocks.PointCloudPanel.mock.calls[0]?.[0];
    expect(pointCloudProps?.frameTransform).toMatchObject({
      sourceFrameId: "lidar_top",
      targetFrameId: "base_link",
    });
  });

  it("prefers a local body frame over a connected global map frame", () => {
    hookMocks.useMcapFrameTransforms.mockReturnValue({
      error: null,
      frameIds: ["base_link", "lidar_top", "map"],
      resolve: createTransformResolver(
        [
          transform("base_link", "lidar_top"),
          transform("map", "base_link", 0n),
        ],
        { endTimeNs: 10n, startTimeNs: 0n }
      ),
      status: "ready",
    });

    render(<ModalRenderer ctx={{} as SampleRendererProps["ctx"]} />);

    const pointCloudProps = panelMocks.PointCloudPanel.mock.calls[0]?.[0];
    expect(pointCloudProps?.frameTransform).toMatchObject({
      sourceFrameId: "lidar_top",
      targetFrameId: "base_link",
    });
  });

  it("lets the 3D panel choose an explicit fixed frame", async () => {
    hookMocks.useMcapFrameTransforms.mockReturnValue({
      error: null,
      frameIds: ["base_link", "lidar_top", "map"],
      resolve: createTransformResolver(
        [
          transform("base_link", "lidar_top"),
          transform("map", "base_link", 0n),
        ],
        { endTimeNs: 10n, startTimeNs: 0n }
      ),
      status: "ready",
    });

    render(<ModalRenderer ctx={{} as SampleRendererProps["ctx"]} />);

    const frameSelect = screen.getByLabelText(
      "Fixed frame"
    ) as HTMLSelectElement;
    expect(frameSelect.value).toBe("__auto__");
    expect(selectValues(frameSelect)).toEqual([
      "__auto__",
      "base_link",
      "lidar_top",
      "map",
    ]);
    expect(selectValues(frameSelect)).not.toContain("ego");
    expect(panelMocks.PointCloudPanel.mock.calls.at(-1)?.[0]).toMatchObject({
      frameTransform: {
        sourceFrameId: "lidar_top",
        targetFrameId: "base_link",
      },
    });

    fireEvent.change(frameSelect, {
      target: { value: "map" },
    });

    await waitFor(() => {
      expect(panelMocks.PointCloudPanel.mock.calls.at(-1)?.[0]).toMatchObject({
        frameTransform: {
          sourceFrameId: "lidar_top",
          targetFrameId: "map",
        },
      });
    });
  });

  it("lists known sensor frames as explicit fixed-frame targets", async () => {
    hookMocks.useMcapFrameTransforms.mockReturnValue({
      error: null,
      frameIds: ["CAM_FRONT", "base_link", "lidar_top"],
      resolve: createTransformResolver([
        transform("base_link", "lidar_top"),
        transform("base_link", "CAM_FRONT"),
      ]),
      status: "ready",
    });

    render(<ModalRenderer ctx={{} as SampleRendererProps["ctx"]} />);

    const frameSelect = screen.getByLabelText(
      "Fixed frame"
    ) as HTMLSelectElement;
    expect(selectValues(frameSelect)).toEqual([
      "__auto__",
      "base_link",
      "lidar_top",
      "CAM_FRONT",
    ]);

    fireEvent.change(frameSelect, {
      target: { value: "CAM_FRONT" },
    });

    await waitFor(() => {
      expect(panelMocks.PointCloudPanel.mock.calls.at(-1)?.[0]).toMatchObject({
        frameTransform: {
          sourceFrameId: "lidar_top",
          targetFrameId: "CAM_FRONT",
        },
      });
    });
  });
});

function createPointCloudMessage(coordinateFrameId?: string) {
  return {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    channelId: 9,
    decoded: {
      decoderId: "foxglove.point-cloud",
      decoderVersion: "1",
      output: {
        visualization: {
          ...(coordinateFrameId ? { coordinateFrameId } : {}),
          fields: [],
          kind: VISUALIZATION_KIND.POINT_CLOUD,
          pointCount: 1,
          positions: new Float32Array([0, 0, 0]),
        },
      },
      payload: {
        encoding: "protobuf",
        schema: "foxglove.PointCloud",
        schemaEncoding: "protobuf",
      },
    },
    logTimeNs: 0n,
    publishTimeNs: 0n,
    sequence: 1,
    timelineTimeNs: 0n,
    topic: "/LIDAR_TOP",
  };
}

function selectValues(select: HTMLSelectElement) {
  return Array.from(select.options, (option) => option.value);
}

function transform(
  parentFrameId: string,
  childFrameId: string,
  timeNs?: bigint
) {
  return {
    childFrameId,
    parentFrameId,
    rotation: new Quaternion(),
    ...(timeNs !== undefined ? { timeNs } : {}),
    translation: new Vector3(),
  };
}

function createTransformResolver(
  samples: readonly ReturnType<typeof transform>[],
  dynamicRange?: { readonly endTimeNs: bigint; readonly startTimeNs: bigint }
) {
  const store = new McapFrameTransformStore();
  store.addStatic(samples.filter((sample) => sample.timeNs === undefined));
  if (dynamicRange) {
    store.addDynamic(
      samples.filter((sample) => sample.timeNs !== undefined),
      dynamicRange
    );
  }

  return (sourceFrameId: string, targetFrameId: string, timeNs: bigint) =>
    store.resolve({ sourceFrameId, targetFrameId, timeNs });
}
