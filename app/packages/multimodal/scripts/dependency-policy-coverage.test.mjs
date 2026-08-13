import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const dependencyConfigPath = require.resolve("../.dependency-cruiser.cjs");
const dependencyConfig = require(dependencyConfigPath);
const packageRoot = dirname(dependencyConfigPath);

describe("dependency policy coverage", () => {
  it("gives every top-level namespace a direct dependency rule", () => {
    const namespacePath = /^\^packages\/multimodal\/src\/([\w-]+)\/$/;
    const declaredNamespaces = new Set(
      dependencyConfig.forbidden.flatMap((rule) => {
        const match = namespacePath.exec(rule.from?.path);
        return match ? [match[1]] : [];
      }),
    );
    const topLevelNamespaces = directories(join(packageRoot, "src"));

    expect(
      topLevelNamespaces.filter(
        (namespace) => !declaredNamespaces.has(namespace),
      ),
    ).toEqual([]);
  });

  it("gives every MCAP stratum an import-boundary rule", () => {
    const stratumRules = dependencyConfig.forbidden.filter((rule) =>
      /^mcap-.*-imports?-only-/.test(rule.name),
    );
    const undeclaredStrata = directories(
      join(packageRoot, "src/adapters/mcap"),
    ).filter((stratum) => {
      const path = `packages/multimodal/src/adapters/mcap/${stratum}/`;
      return !stratumRules.some((rule) =>
        new RegExp(rule.from.path).test(path),
      );
    });

    expect(undeclaredStrata).toEqual([]);
  });
});

function directories(url) {
  return readdirSync(url, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}
