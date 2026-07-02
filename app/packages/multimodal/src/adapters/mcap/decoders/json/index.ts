import type { Decoder } from "../../../../decoders";
import { jsonPoseDecoder } from "./pose";

/**
 * JSON Pose decoder export.
 */
export { jsonPoseDecoder } from "./pose";

/**
 * JSON payload descriptor exports.
 */
export * from "./payloads";

/**
 * Built-in JSON decoders for the MCAP adapter.
 */
export const jsonDecoders: readonly Decoder[] = [jsonPoseDecoder];
