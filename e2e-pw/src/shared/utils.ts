import fs from "fs/promises";

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
