import type { PayloadDescriptor } from "../../../../decoders";

export * from "./protobuf/payloads";

/**
 * Payload identities for foxglove_msgs/msg/CompressedVideo messages carried
 * over ROS 2 CDR encodings.
 */
export const FOXGLOVE_COMPRESSED_VIDEO_CDR_PAYLOADS: readonly PayloadDescriptor[] =
  [
    {
      encoding: "cdr",
      schema: "foxglove_msgs/msg/CompressedVideo",
      schemaEncoding: "ros2msg",
    },
    {
      encoding: "cdr",
      schema: "foxglove_msgs/msg/CompressedVideo",
      schemaEncoding: "ros2idl",
    },
  ];
