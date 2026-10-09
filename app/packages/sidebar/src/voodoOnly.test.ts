import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = join(__dirname);
const FORBIDDEN =
  /from\s+["'](@mui\/[^"']*|@fiftyone\/components[^"']*|[^"']*\/components\/src\/[^"']*)["']/;

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(dir, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );

describe("@fiftyone/sidebar", () => {
  it("imports no MUI and no legacy @fiftyone/components", () => {
    const offenders = sources(SOURCE).filter((file) =>
      FORBIDDEN.test(readFileSync(file, "utf-8")),
    );

    expect(offenders).toEqual([]);
  });
});
