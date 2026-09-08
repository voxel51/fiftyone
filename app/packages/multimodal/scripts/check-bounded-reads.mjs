import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const episodeRoot = fileURLToPath(
  new URL("../src/views/episode/", import.meta.url),
);

function productionSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return ["__tests__", "testing"].includes(entry.name)
        ? []
        : productionSources(path);
    }
    if (
      !/\.[cm]?[jt]sx?$/.test(entry.name) ||
      /\.(?:bench|spec|test)\.[cm]?[jt]sx?$/.test(entry.name)
    ) {
      return [];
    }
    return [path];
  });
}

const manifestWideReads = new Map();
for (const path of productionSources(episodeRoot)) {
  const contents = readFileSync(path, "utf8");
  if (!contents.includes("session.read(")) continue;

  const count = contents.match(/session\.manifest\.timeRange/g)?.length ?? 0;
  if (count > 0) {
    const source = relative(episodeRoot, path).split(sep).join("/");
    manifestWideReads.set(source, count);
  }
}

assert.deepEqual(
  manifestWideReads,
  new Map(),
  "manifest-wide view reads must use a source-budgeted bounded-read job",
);

console.log("Multimodal bounded-read policy verified");
