import type { McapTypes } from "@mcap/core";
import * as mcapSupport from "@mcap/support";
import type { Root } from "protobufjs";

// @mcap/support@1.1.0 exports these at runtime, but its declaration barrel
// re-exports .ts paths from dist. Keep the typing workaround at this boundary.
const typedMcapSupport = mcapSupport as unknown as {
  loadDecompressHandlers: () => Promise<McapTypes.DecompressHandlers>;
  protobufFromBinaryDescriptor: (schemaData: Uint8Array) => Root;
};

/**
 * Loads MCAP decompression handlers through the typed support shim.
 */
export const loadDecompressHandlers = typedMcapSupport.loadDecompressHandlers;

/**
 * Builds a protobuf root from MCAP binary schema descriptors.
 */
export const protobufFromBinaryDescriptor =
  typedMcapSupport.protobufFromBinaryDescriptor;
