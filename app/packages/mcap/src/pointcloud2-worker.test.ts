import { afterEach, describe, expect, it, vi } from "vitest";

const { decodePointCloud2PayloadMock, decodeFoxglovePointCloudPayloadMock } =
  vi.hoisted(() => ({
    decodePointCloud2PayloadMock: vi.fn(),
    decodeFoxglovePointCloudPayloadMock: vi.fn(),
  }));

vi.mock("./pointcloud2-decoder", () => ({
  decodePointCloud2Payload: decodePointCloud2PayloadMock,
}));

vi.mock("./foxglove-pointcloud-decoder", () => ({
  decodeFoxglovePointCloudPayload: decodeFoxglovePointCloudPayloadMock,
}));

import { decodeMultimodalPointCloudRequest } from "./pointcloud2-worker";

describe("pointcloud2-worker", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches ROS point clouds by schema name", () => {
    decodePointCloud2PayloadMock.mockReturnValue({
      messageId: "",
      frame: {
        id: "",
        pointCount: 1,
        bounds: {
          min: [0, 0, 0] as [number, number, number],
          max: [0, 0, 0] as [number, number, number],
        },
        frameId: "lidar",
        primitives: [],
      },
    });

    const decoded = decodeMultimodalPointCloudRequest({
      messageId: "cloud-1",
      schemaName: "sensor_msgs/msg/PointCloud2",
      payload: Uint8Array.from([1, 2, 3]).buffer,
    });

    expect(decodePointCloud2PayloadMock).toHaveBeenCalledWith(
      expect.any(Uint8Array)
    );
    expect(decodeFoxglovePointCloudPayloadMock).not.toHaveBeenCalled();
    expect(decoded.messageId).toBe("cloud-1");
  });

  it("dispatches Foxglove point clouds by schema name", () => {
    decodeFoxglovePointCloudPayloadMock.mockReturnValue({
      messageId: "",
      frame: {
        id: "",
        pointCount: 1,
        bounds: {
          min: [0, 0, 0] as [number, number, number],
          max: [1, 1, 1] as [number, number, number],
        },
        frameId: "lidar",
        primitives: [],
      },
    });

    const decoded = decodeMultimodalPointCloudRequest({
      messageId: "cloud-2",
      schemaName: "foxglove.PointCloud",
      payload: Uint8Array.from([4, 5, 6]).buffer,
    });

    expect(decodeFoxglovePointCloudPayloadMock).toHaveBeenCalledWith(
      expect.any(Uint8Array)
    );
    expect(decodePointCloud2PayloadMock).not.toHaveBeenCalled();
    expect(decoded.messageId).toBe("cloud-2");
  });
});
