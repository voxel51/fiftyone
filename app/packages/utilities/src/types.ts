/**
 * Segmentation mask — base64-encoded compressed numpy array,
 * or MongoDB binary wrapper.
 */
export type SerializedMask = string | { $binary: { base64: string } };
