import type { McapTypes } from "@mcap/core";
import * as mcapSupport from "@mcap/support";
import type { Root } from "protobufjs";

// @mcap/support@1.1.0 exports these at runtime, but its declaration barrel
// re-exports .ts paths from dist. Keep the typing workaround at this boundary.
const typedMcapSupport = mcapSupport as unknown as {
  loadDecompressHandlers: () => Promise<McapTypes.DecompressHandlers>;
  protobufFromBinaryDescriptor: (schemaData: Uint8Array) => Root;
};

let loadedDecompressHandlers: McapTypes.DecompressHandlers | undefined;
let decompressHandlersPromise:
  | Promise<McapTypes.DecompressHandlers>
  | undefined;

/**
 * Loads MCAP decompression handlers through the typed support shim.
 */
export async function loadDecompressHandlers(): Promise<McapTypes.DecompressHandlers> {
  const handlers = await (decompressHandlersPromise ??=
    typedMcapSupport.loadDecompressHandlers());
  loadedDecompressHandlers = handlers;
  return handlers;
}

/**
 * Returns a decompression handler after the MCAP reader has initialized them.
 */
export function loadedMcapDecompressHandler(
  compression: string,
): McapTypes.DecompressHandlers[string] {
  const handler = loadedDecompressHandlers?.[compression];
  if (!handler) {
    throw new Error(`MCAP ${compression} decompression is not initialized`);
  }
  return handler;
}

/**
 * Builds a protobuf root from MCAP binary schema descriptors.
 */
export const protobufFromBinaryDescriptor =
  typedMcapSupport.protobufFromBinaryDescriptor;
