/**
 * JSON payload descriptors supported by the MCAP decoder. JSON schema
 * names are exporter-chosen and unnamespaced, so decoders registered for
 * these triples must validate payload shape rather than trust the name.
 */
import type { PayloadDescriptor } from "../../../../decoders";

/**
 * Payload identity for JSON `Pose` messages (odometry-style exports:
 * position/orientation plus optional velocity/acceleration/rotation rate).
 */
export const JSON_POSE_PAYLOAD: PayloadDescriptor = {
  encoding: "json",
  schema: "Pose",
  schemaEncoding: "jsonschema",
};
