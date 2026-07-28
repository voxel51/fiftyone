import * as jsonpatch from "fast-json-patch";

/**
 * Segmentation mask — base64-encoded compressed numpy array,
 * or MongoDB binary wrapper.
 */
export type SerializedMask = string | { $binary: { base64: string } };

/**
 * List of JSON-patch operation deltas between two versions of a json object.
 */
export type JSONDeltas = jsonpatch.Operation[];

export type JSONDeltaSupplier = <T>(a: T, b: T) => JSONDeltas;
