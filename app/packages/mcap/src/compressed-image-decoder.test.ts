import { MessageWriter } from "@foxglove/rosmsg2-serialization";
import { parse } from "@foxglove/rosmsg";
import { describe, expect, it } from "vitest";
import {
  decodeCompressedImagePayload,
  getCompressedImageMimeType,
} from "./compressed-image-decoder";

const COMPRESSED_IMAGE_DEFINITION = `sensor_msgs/msg/Header header
string format
uint8[] data
================================================================================
MSG: sensor_msgs/msg/Header
builtin_interfaces/msg/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/msg/Time
int32 sec
uint32 nanosec`;

describe("compressed image decoder", () => {
  it("decodes ROS2 CDR compressed-image payloads", () => {
    const writer = new MessageWriter(
      parse(COMPRESSED_IMAGE_DEFINITION, { ros2: true })
    );
    const payload = writer.writeMessage({
      header: {
        stamp: { sec: 0, nanosec: 0 },
        frame_id: "camera",
      },
      format: "jpeg",
      data: Uint8Array.from([1, 2, 3, 4]),
    });

    const decoded = decodeCompressedImagePayload(payload);

    expect(decoded.format).toBe("jpeg");
    expect(decoded.compressedBytes).toEqual(Uint8Array.from([1, 2, 3, 4]));
  });

  it("maps compressed-image format strings to browser MIME types", () => {
    expect(getCompressedImageMimeType("jpeg")).toBe("image/jpeg");
    expect(getCompressedImageMimeType("rgb8; png compressed")).toBe(
      "image/png"
    );
    expect(getCompressedImageMimeType("webp")).toBe("image/webp");
  });
});
