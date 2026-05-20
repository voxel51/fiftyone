export * from "./registry";
export * from "./resource-hints";
export * from "./types";

import { DecoderRegistry } from "./registry";

/**
 * Default runtime decoder registry for source-agnostic query clients.
 * Format adapters register their own built-ins.
 */
export const defaultDecoderRegistry = new DecoderRegistry();
