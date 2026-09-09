const BYTES_PER_MEGABYTE = 1024 * 1024;

export { BYTE_SOURCE_READ_PROFILE } from "../../ir";

/**
 * Default in-memory raw byte cache budget.
 */
export const DEFAULT_BYTE_CACHE_SIZE_BYTES = 128 * BYTES_PER_MEGABYTE;

/**
 * Default block size for local/unknown read-through byte cache fills.
 */
export const DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES = 2 * BYTES_PER_MEGABYTE;

/**
 * Default block size for remote/object-storage read-through byte cache fills.
 */
export const DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES =
  32 * BYTES_PER_MEGABYTE;
