export * from "./registry";
export * from "./resource-hints";
export * from "./types";

import { DecoderRegistry } from "./registry";

/**
 * Creates a source-agnostic decoder registry.
 */
export function createDefaultDecoderRegistry(): DecoderRegistry {
  return new DecoderRegistry();
}

/**
 * Default runtime decoder registry for source-agnostic resource clients.
 * Format adapters register their own built-ins.
 */
export const defaultDecoderRegistry = createDefaultDecoderRegistry();
