/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import fs from "fs/promises";
import { ObjectId } from "mongodb";

/**
 * Ensure a directory path exists.
 * @param dirPath The directory path.
 */
export const ensureDirExists = async (dirPath: string) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Handle potential errors that aren't 'EEXIST' (e.g., permission denied)
    // 'EEXIST' for the target dir itself is handled by recursive: true
    if (error.code !== "EEXIST") {
      console.error("Error ensuring directory:", error);
      throw error;
    }
  }
};

/**
 * Creates a MongoDB-style object ID wrapper.
 * @param id An optional string to initialize the ObjectId. If omitted, a new unique ObjectId is generated.
 * @returns An object with an `$oid` field containing the string representation of the ObjectId.
 */
export const createId = (id?: string) => {
  return { $oid: new ObjectId(id).toString() };
};

/**
 * Converts a non-negative integer into a 24-character zero-padded hex string,
 * suitable for use as a MongoDB-compatible ObjectId.
 *
 * Negative integers are converted to their unsigned 32-bit representation
 * before encoding.
 *
 * @param integer - The integer to convert. Must be a whole number.
 * @returns A 24-character hexadecimal string.
 * @throws {TypeError} If `integer` is not an integer.
 *
 * @example
 * indexToId(0)   // "000000000000000000000000"
 * indexToId(255) // "0000000000000000000000ff"
 */
export const indexToId = (integer: number) => {
  if (!Number.isInteger(integer))
    throw new TypeError("value is not an integer");

  return (integer < 0 ? integer >>> 0 : integer).toString(16).padStart(24, "0");
};
