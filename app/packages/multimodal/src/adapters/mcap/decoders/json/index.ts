import type { Decoder } from "../../../../decoders";
import { jsonPoseDecoder } from "./pose";
import { jsonRosDecoders } from "./ros";

/**
 * JSON Pose decoder export.
 */
export { jsonPoseDecoder } from "./pose";

/**
 * JSON-schema ROS decoder exports.
 */
export * from "./ros";

/**
 * JSON payload descriptor exports.
 */
export * from "./payloads";

/**
 * Built-in JSON decoders for the MCAP adapter.
 */
export const jsonDecoders: readonly Decoder[] = [
  jsonPoseDecoder,
  ...jsonRosDecoders,
];
