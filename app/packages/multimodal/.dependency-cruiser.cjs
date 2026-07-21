const SRC = "^packages/multimodal/src/";
const ENTERPRISE = `${SRC}enterprise/`;
const INJECT_ENTRY = `${SRC}inject/index\\.ts$`;
const ENTERPRISE_SHARED_FACADES =
  `${SRC}(extensions/(timeline|tiles)/(index|runtime)\\.ts$|` +
  `query/bytes/index\\.ts$|visualization/index\\.ts$)`;
const MCAP = `${SRC}adapters/mcap/`;
const IR = `${SRC}ir/`;
const PORTS = `${SRC}ports/`;
const ADAPTERS = `${SRC}adapters/`;
const VISUALIZATION = `${SRC}visualization/`;
const EPISODE = `${SRC}views/episode/`;
const EPISODE_INDEX = `${EPISODE}index\\.ts$`;
const VIEWS_ENTRY = `${SRC}views/entry\\.tsx$`;
const FORMAT_VENDORS = "^(@mcap/|@foxglove/|hyparquet$|mp4box$)";

module.exports = {
  forbidden: [
    {
      // Keep the intermediate representation (IR) as the innermost data model so
      // its types remain reusable without pulling in higher-level behavior.
      name: "ir-is-a-leaf",
      severity: "error",
      from: { path: IR },
      to: { path: SRC, pathNot: IR },
    },
    {
      // Allow ports to describe contracts using only IR types so every
      // implementation can satisfy them without inheriting runtime details.
      name: "ports-import-only-ir",
      severity: "error",
      from: { path: PORTS },
      to: { path: SRC, pathNot: `${SRC}(ports|ir)/` },
    },
    {
      // Confine format-specific vendor APIs to adapters so the rest of the
      // package operates on neutral ports and intermediate representations.
      name: "only-adapters-import-format-vendors",
      severity: "error",
      from: { path: SRC, pathNot: ADAPTERS },
      to: { path: FORMAT_VENDORS },
    },
    {
      // Keep each format adapter independent so adding or removing one cannot
      // create hidden coupling to another format implementation.
      name: "adapters-do-not-import-other-adapters",
      severity: "error",
      from: { path: `${SRC}adapters/([^/]+)/` },
      to: { path: ADAPTERS, pathNot: `${SRC}adapters/$1/` },
    },
    {
      // Prevent adapters from reaching upward into UI and runtime orchestration
      // so dependency flow continues from the shell toward infrastructure.
      name: "adapters-do-not-import-shell",
      severity: "error",
      from: {
        path: ADAPTERS,
        pathNot: `${ADAPTERS}.*\\.test\\.[jt]sx?$`,
      },
      to: {
        path: `${SRC}(views|extensions|visualization|runtime|scene-inventory|temporal-tags)/`,
      },
    },
    {
      // Tile contributions receive only format-neutral contracts and host
      // settings, so they stay portable across changes to episode internals.
      name: "tile-extensions-do-not-import-episode-internals",
      comment:
        "Build-time tile extensions use their public facade instead of coupling to the episode application's private providers.",
      severity: "error",
      from: {
        path: `${SRC}extensions/tiles/`,
        pathNot: `${SRC}extensions/tiles/.*\\.test\\.[jt]sx?$`,
      },
      to: { path: EPISODE },
    },
    {
      // Keep visualization limited to data and decoding foundations so display
      // machinery cannot acquire sources or depend on application policy.
      name: "visualization-imports-only-foundations",
      comment:
        "Visualization consumes prepared data and must not reach into product or acquisition layers.",
      severity: "error",
      from: { path: VISUALIZATION },
      to: {
        path: SRC,
        pathNot: `${SRC}(visualization|ir|decoders|utils|types)/`,
      },
    },
    {
      // Ensure format-neutral renderers cannot reach an adapter indirectly,
      // which protects the episode-session abstraction from backdoor coupling.
      name: "agnostic-renderers-cannot-reach-an-adapter",
      severity: "error",
      from: {
        path:
          `${SRC}views/(EpisodeSessionRenderer\\.tsx$|` +
          `episode/(shell/EpisodeModalRenderer|grid/GridRenderer)\\.tsx$)`,
      },
      to: { path: ADAPTERS, reachable: true },
    },
    {
      // Route ordinary production consumers through the episode entrypoint so
      // its external surface stays explicit. The views composition root may
      // target leaf components directly to define precise lazy-load boundaries.
      name: "episode-production-callers-use-entrypoint",
      comment:
        "Production modules outside the episode domain use its root entrypoint; the views composition root may load leaf chunks directly.",
      severity: "error",
      from: {
        path: SRC,
        pathNot: `${EPISODE}|${VIEWS_ENTRY}|${SRC}testing/|\\.test\\.[jt]sx?$`,
      },
      to: {
        path: EPISODE,
        pathNot: EPISODE_INDEX,
      },
    },
    {
      // Require episode domains to use canonical file paths instead of their
      // own public barrel, avoiding cycles and making ownership visible.
      name: "episode-domains-do-not-import-entrypoint",
      comment:
        "The episode entrypoint is for outside callers; domain code uses direct canonical paths.",
      severity: "error",
      from: { path: `${EPISODE}[^/]+/` },
      to: { path: EPISODE_INDEX },
    },
    {
      // Keep shared multimodal code independent of enterprise implementations
      // so the OSS package remains usable without enterprise modules present.
      name: "shared-multimodal-does-not-import-enterprise",
      severity: "error",
      from: {
        path: SRC,
        pathNot: `${SRC}(enterprise/|inject/index\\.ts$)`,
      },
      to: { path: ENTERPRISE },
    },
    {
      // Limit the composition root to the enterprise entry module so enterprise
      // wiring has one auditable integration seam rather than deep imports.
      name: "inject-entry-imports-only-enterprise-entry",
      severity: "error",
      from: { path: INJECT_ENTRY },
      to: {
        path: ENTERPRISE,
        pathNot: `${ENTERPRISE}inject\\.ts$`,
      },
    },
    {
      // Make enterprise code consume stable shared facades so it does not bind
      // directly to package internals that are free to evolve.
      name: "enterprise-imports-shared-only-through-facades",
      severity: "error",
      from: { path: ENTERPRISE },
      to: {
        path: SRC,
        pathNot: `${ENTERPRISE}|${ENTERPRISE_SHARED_FACADES}`,
      },
    },
    {
      // Reserve adapter imports for composition and integration code so all
      // format-agnostic layers remain portable across data sources.
      name: "agnostic-layers-do-not-import-adapters",
      severity: "error",
      from: {
        path: SRC,
        pathNot: `${SRC}(adapters/|inject/index\\.ts$|testing/integration/)`,
      },
      to: { path: ADAPTERS },
    },
    {
      // Stop shared layers from importing the composition root, which preserves
      // dependency inversion and prevents initialization cycles.
      name: "shared-layers-do-not-import-the-composition-root",
      severity: "error",
      from: { path: SRC, pathNot: INJECT_ENTRY },
      to: { path: INJECT_ENTRY },
    },
    {
      // Prevent the shared multimodal package from depending on Teams code so
      // the OSS build stays self-contained and independently distributable.
      name: "multimodal-does-not-import-teams",
      severity: "error",
      from: { path: SRC },
      to: { path: `${SRC}teams/|^teams-app/|@fiftyone/teams-multimodal` },
    },
    {
      // Keep decoders independent of query and I/O orchestration so decoding
      // remains a pure transformation that callers can reuse anywhere.
      name: "decoders-do-not-import-query",
      severity: "error",
      from: { path: `${SRC}decoders/` },
      to: { path: `${SRC}query/` },
    },
    {
      // Allow only the injection root to bootstrap the view entry so shared
      // modules cannot trigger application composition as an import side effect.
      name: "only-inject-imports-view-entry",
      severity: "error",
      from: {
        path: SRC,
        pathNot: `${SRC}(inject/index\\.ts$|views/entry\\.tsx$)`,
      },
      to: { path: `${SRC}views/entry\\.tsx$` },
    },
    {
      // Keep MCAP resource orchestration independent of worker transport so it
      // can run with alternate schedulers and in direct-read environments.
      name: "mcap-resources-do-not-import-worker",
      severity: "error",
      from: { path: `${MCAP}resources/` },
      to: { path: `${MCAP}worker/` },
    },
    {
      // Prevent MCAP resources from reaching upward into public and React
      // facades, preserving a one-way adapter layering model without cycles.
      name: "mcap-resources-stay-below-adapter-facade",
      severity: "error",
      from: { path: `${MCAP}resources/` },
      to: {
        path: `${MCAP}(react/|index\\.ts$|resource-client\\.ts$)`,
      },
    },
    {
      // Keep MCAP decoding, reading, resources, and workers headless so the core
      // format implementation remains reusable outside React renderers.
      name: "mcap-core-layers-do-not-import-renderers",
      severity: "error",
      from: { path: `${MCAP}(decoders|reader|resources|worker)(/|$)` },
      to: {
        path: `${MCAP}(react/|entry\\.tsx$)`,
      },
    },
    {
      // Keep the MCAP worker below adapter and renderer facades so background
      // execution cannot depend on the APIs that orchestrate it.
      name: "mcap-worker-does-not-import-renderer-facade",
      severity: "error",
      from: { path: `${MCAP}worker/` },
      to: {
        path: `${MCAP}(react/|entry\\.tsx$|index\\.ts$|resource-client\\.ts$)`,
      },
    },
    {
      // Keep the MCAP reader focused on low-level reads by preventing it from
      // depending on resource, worker, adapter, or UI orchestration above it.
      name: "mcap-reader-stays-below-resource-orchestration",
      severity: "error",
      from: { path: `${MCAP}reader/` },
      to: {
        path: `${MCAP}(resources/|worker/|react/|entry\\.tsx$|index\\.ts$|resource-client\\.ts$)`,
      },
    },
    {
      // Keep MCAP decoders at the bottom of the adapter stack so parsing cannot
      // depend on readers, resource scheduling, workers, or public facades.
      name: "mcap-decoders-stay-below-reader-and-resources",
      severity: "error",
      from: { path: `${MCAP}decoders/` },
      to: {
        path: `${MCAP}(reader/|resources/|worker/|react/|entry\\.tsx$|index\\.ts$|resource-client\\.ts$)`,
      },
    },
    {
      // Keep schemas as portable data definitions rather than binding generated
      // contracts to adapter, query, decoder, or visualization runtimes.
      name: "schemas-do-not-import-runtime-layers",
      severity: "error",
      from: { path: `${SRC}schemas/` },
      to: { path: `${SRC}(adapters|decoders|query|visualization)/` },
    },
  ],
  required: [
    {
      // Require every episode implementation file to declare a product domain
      // so the root remains a deliberate public boundary instead of a new flat dump.
      name: "no-flat-episode-typescript-files",
      comment:
        "Episode TypeScript belongs in a product domain; only index.ts may remain at the root.",
      severity: "error",
      module: {
        path: `${EPISODE}(?!index\\.ts$)[^/]+\\.tsx?$`,
      },
      // No real module can satisfy this path. Matching root files therefore
      // fail the required rule even when they have no imports of their own.
      to: { path: "^$" },
    },
  ],
  options: {
    includeOnly: "^packages/multimodal/",
    tsPreCompilationDeps: true,
  },
};
