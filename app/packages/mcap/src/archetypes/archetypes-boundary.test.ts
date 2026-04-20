import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const archetypesRoot = path.resolve(
  process.cwd(),
  "packages/mcap/src/archetypes"
);

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolvedPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(resolvedPath);
    }

    if (
      !/\.(ts|tsx)$/.test(entry.name) ||
      /\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      return [];
    }

    return [resolvedPath];
  });
}

describe("archetypes boundary", () => {
  it("keeps production archetype imports local or third-party", () => {
    const sourceFiles = collectSourceFiles(archetypesRoot);
    const importPattern =
      /(?:import|export)\s+(?:[^'"]+?\s+from\s+)?["']([^"']+)["']/g;

    for (const sourceFile of sourceFiles) {
      const contents = fs.readFileSync(sourceFile, "utf8");
      const matches = Array.from(contents.matchAll(importPattern));

      for (const match of matches) {
        const specifier = match[1];

        if (specifier.startsWith(".")) {
          const resolved = path.resolve(path.dirname(sourceFile), specifier);
          expect(resolved.startsWith(archetypesRoot), specifier).toBe(true);
          continue;
        }

        expect(specifier.startsWith("@fiftyone/multimodal"), specifier).toBe(
          false
        );
        expect(specifier.startsWith("@fiftyone/mcap"), specifier).toBe(false);
        expect(specifier.includes("/mcap"), specifier).toBe(false);
      }
    }
  });
});
