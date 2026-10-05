/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { readFileSync, writeFileSync } from "fs";

/**
 * Rewrite an mp4's sync-sample table (`stss`, first track) in place, entry for
 * entry, so a test can model a container whose keyframe flags disagree with
 * the coded frames. The entry count must match the existing table: the box
 * keeps its size, so no other offset in the file moves.
 */
export const rewriteSyncTable = (path: string, syncSamples: number[]) => {
  const buf = readFileSync(path);
  const stss = findBox(buf, ["moov", "trak", "mdia", "minf", "stbl", "stss"]);
  if (!stss) {
    throw new Error(`${path}: no stss box`);
  }

  // Full box: 4 bytes of version + flags, then the entry count.
  const count = buf.readUInt32BE(stss.start + 4);
  if (count !== syncSamples.length) {
    throw new Error(
      `${path}: stss has ${count} entries, cannot write ${syncSamples.length}`,
    );
  }

  syncSamples.forEach((sample, i) => {
    buf.writeUInt32BE(sample, stss.start + 8 + 4 * i);
  });
  writeFileSync(path, buf);
};

/** Payload bounds `[start, end)` of a box. */
interface BoxBody {
  start: number;
  end: number;
}

const findBox = (
  buf: Buffer,
  path: string[],
  start = 0,
  end = buf.length,
): BoxBody | null => {
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    let header = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(p + 8));
      header = 16;
    } else if (size === 0) {
      size = end - p;
    }

    if (type === path[0]) {
      const body = { start: p + header, end: p + size };
      return path.length === 1
        ? body
        : findBox(buf, path.slice(1), body.start, body.end);
    }

    p += size;
  }

  return null;
};
