/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import fs from "fs";
import path from "path";
import type { MediaOptions } from "./types";

/**
 * Shared bookkeeping around writing one media file: the parent directory
 * exists, an already-written file is reused (media paths are unique per run,
 * so an existing file is this run's own), and generation is logged with its
 * duration unless `hideLogs`.
 */
export const generateOnce = (
  kind: string,
  options: MediaOptions,
  generate: () => void | Promise<void>,
  hideLogs = false,
): void | Promise<void> => {
  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  if (fs.existsSync(options.outputPath)) {
    return;
  }

  const startTime = performance.now();
  if (!hideLogs) {
    console.log(`Creating ${kind} with options: ${JSON.stringify(options)}`);
  }
  const log = () => {
    if (!hideLogs) {
      console.log(
        `${kind} generation, path = ${options.outputPath}, completed in ${performance.now() - startTime} milliseconds`,
      );
    }
  };

  const result = generate();
  return result instanceof Promise ? result.then(log) : log();
};
