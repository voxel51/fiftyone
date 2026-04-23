import { afterEach, describe, expect, it, vi } from "vitest";

const {
  decodeCompressedImagePayloadMock,
  decodeFoxgloveCompressedImagePayloadMock,
} = vi.hoisted(() => ({
  decodeCompressedImagePayloadMock: vi.fn(),
  decodeFoxgloveCompressedImagePayloadMock: vi.fn(),
}));

vi.mock("./compressed-image-decoder", () => ({
  decodeCompressedImagePayload: decodeCompressedImagePayloadMock,
}));

vi.mock("./foxglove-compressed-image-decoder", () => ({
  decodeFoxgloveCompressedImagePayload:
    decodeFoxgloveCompressedImagePayloadMock,
}));

import { decodeMultimodalCompressedImageRequest } from "./compressed-image-worker";

describe("compressed-image-worker", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches ROS compressed images by schema name", () => {
    decodeCompressedImagePayloadMock.mockReturnValue({
      messageId: "",
      format: "jpeg",
      frameId: "camera",
      compressedBytes: Uint8Array.from([1, 2, 3]),
    });

    const decoded = decodeMultimodalCompressedImageRequest({
      messageId: "image-1",
      schemaName: "sensor_msgs/msg/CompressedImage",
      payload: Uint8Array.from([1, 2, 3]).buffer,
    });

    expect(decodeCompressedImagePayloadMock).toHaveBeenCalledWith(
      expect.any(Uint8Array)
    );
    expect(decodeFoxgloveCompressedImagePayloadMock).not.toHaveBeenCalled();
    expect(decoded.messageId).toBe("image-1");
  });

  it("dispatches Foxglove compressed images by schema name", () => {
    decodeFoxgloveCompressedImagePayloadMock.mockReturnValue({
      messageId: "",
      format: "png",
      frameId: "camera",
      compressedBytes: Uint8Array.from([4, 5, 6]),
    });

    const decoded = decodeMultimodalCompressedImageRequest({
      messageId: "image-2",
      schemaName: "foxglove.CompressedImage",
      payload: Uint8Array.from([4, 5, 6]).buffer,
    });

    expect(decodeFoxgloveCompressedImagePayloadMock).toHaveBeenCalledWith(
      expect.any(Uint8Array)
    );
    expect(decodeCompressedImagePayloadMock).not.toHaveBeenCalled();
    expect(decoded.messageId).toBe("image-2");
  });
});
