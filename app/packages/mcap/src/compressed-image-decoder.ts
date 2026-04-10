import { parse } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg2-serialization";

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

type CompressedImageMessage = {
  format: string;
  data: Uint8Array;
};

const compressedImageReader = new MessageReader<CompressedImageMessage>(
  parse(COMPRESSED_IMAGE_DEFINITION, { ros2: true })
);

/** Worker request payload for one raw `CompressedImage` MCAP message. */
export type McapCompressedImageDecodeRequest = {
  messageId: string;
  payload: ArrayBuffer;
};

/** Worker response payload for one decoded `CompressedImage` message. */
export type McapCompressedImageDecodeResponse = {
  messageId: string;
  format: string;
  compressedBytes: Uint8Array;
};

/** Decodes one ROS2 CDR `sensor_msgs/msg/CompressedImage` payload. */
export function decodeCompressedImagePayload(
  payload: Uint8Array
): McapCompressedImageDecodeResponse {
  const message =
    compressedImageReader.readMessage<CompressedImageMessage>(payload);

  return {
    messageId: "",
    format: message.format || "",
    compressedBytes:
      message.data instanceof Uint8Array
        ? message.data
        : Uint8Array.from(message.data ?? []),
  };
}

/** Maps a ROS `CompressedImage.format` string to a browser image MIME type. */
export function getCompressedImageMimeType(format: string): string {
  const normalizedFormat = format.trim().toLowerCase();

  if (normalizedFormat.includes("png") || normalizedFormat.includes("zlib")) {
    return "image/png";
  }

  if (normalizedFormat.includes("jpg") || normalizedFormat.includes("jpeg")) {
    return "image/jpeg";
  }

  if (normalizedFormat.includes("webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}
