import type { Decoder } from "../../../../decoders/index";
import { jsonPoseDecoder } from "./pose";
import { jsonFoxgloveCompressedAudioDecoder } from "./compressed-audio";
import { jsonFoxgloveRawAudioDecoder } from "./raw-audio";
import { jsonRosDecoders } from "./ros";

/**
 * JSON Pose decoder export.
 */
export { jsonPoseDecoder } from "./pose";

/**
 * JSON Foxglove audio decoder exports (RawAudio and CompressedAudio).
 */
export { jsonFoxgloveCompressedAudioDecoder } from "./compressed-audio";
export { jsonFoxgloveRawAudioDecoder } from "./raw-audio";

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
  jsonFoxgloveRawAudioDecoder,
  jsonFoxgloveCompressedAudioDecoder,
  ...jsonRosDecoders,
];
