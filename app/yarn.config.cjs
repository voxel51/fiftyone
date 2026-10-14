// Yarn constraints (`yarn constraints`; `yarn constraints --fix` rewrites
// manifests). Enforced in CI by lint-app.yml.
//
// Some dependencies must exist exactly once in the bundle. The design system
// carries React context and CSS: two copies means two contexts and two
// stylesheets, and when the catalog moves, a stray range leaves the merged
// lockfile unable to satisfy it — downstream image builds then fail at
// install with no readable error. So a singleton's version lives in ONE place,
// the yarn catalog in .yarnrc.yml, and every workspace defers to it with
// `catalog:`. Peer dependencies are exempt: the catalog protocol is not valid
// there. The same rule runs downstream over the enterprise app's own
// workspaces (.github/scripts/catalog-drift.mjs there).

/** Dependencies that must resolve to one version across the monorepo. */
const SINGLETONS = ["@voxel51/voodo"];

/** `catalog:` and the named form `catalog:<group>` both defer to the catalog. */
const isCatalogRange = (range) => range.startsWith("catalog:");

/**
 * The package a `resolutions` selector targets: its last descriptor without
 * the range. Selectors read `pkg`, `parent/pkg`, `pkg@range` or
 * `parent@range/pkg@range`, and a scoped name keeps its `@scope/` prefix.
 */
const resolutionTarget = (selector) =>
  selector.match(/(?:^|\/)(@[^/@]+\/[^/@]+|[^/@]+)(?:@[^/]*)?$/)?.[1];

module.exports = {
  async constraints({ Yarn }) {
    for (const ident of SINGLETONS) {
      for (const dependency of Yarn.dependencies({ ident })) {
        if (dependency.type === "peerDependencies") {
          continue;
        }
        if (!isCatalogRange(dependency.range)) {
          // `--fix` rewrites it; without `--fix` this reports the mismatch
          dependency.update("catalog:");
        }
      }

      for (const workspace of Yarn.workspaces()) {
        for (const selector of Object.keys(
          workspace.manifest.resolutions ?? {},
        )) {
          if (resolutionTarget(selector) === ident) {
            workspace.unset(["resolutions", selector]);
          }
        }
      }
    }
  },
};
