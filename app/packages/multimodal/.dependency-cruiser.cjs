const SRC = "^packages/multimodal/src/";
const ROOT_ENTRY = `${SRC}index\\.ts$`;
const TEST_MODULE =
  "(?:^|/)(?:testing/|[^/]+\\.test\\.[cm]?[jt]sx?$|" +
  "[^/]+(?:-test-utils|\\.test-utils)\\.[cm]?[jt]sx?$)";

const ADAPTERS = `${SRC}adapters/`;
const CODECS = `${SRC}codecs/`;
const DECODERS = `${SRC}decoders/`;
const ENTERPRISE = `${SRC}enterprise/`;
const EPISODE = `${SRC}views/episode/`;
const EPISODE_INDEX = `${EPISODE}index\\.ts$`;
const EPISODE_SETTINGS_CONTROLS_INDEX = `${EPISODE}settings/controls/index\\.ts$`;
const EPISODE_MAP_RENDERING = `${EPISODE}map/rendering/`;
const EXTENSIONS = `${SRC}extensions/`;
const GRID_OVERLAY = `${SRC}grid-overlay/`;
const EXTENSION_HOST = `${EXTENSIONS}host/`;
const INJECT = `${SRC}inject/`;
const INJECT_ENTRY = `${INJECT}index\\.ts$`;
const IR = `${SRC}ir/`;
const OBSERVABILITY = `${SRC}observability/`;
const AUDIO = `${SRC}audio/`;
const PORTS = `${SRC}ports/`;
const QUERY = `${SRC}query/`;
const RUNTIME = `${SRC}runtime/`;
const POINT_CLOUD_RUNTIME_LEAVES = `${RUNTIME}point-cloud-(channel-encoding|render-payload)\\.ts$`;
const SCENE_INVENTORY = `${SRC}scene-inventory/`;
const SCHEMAS = `${SRC}schemas/`;
const STREAM_SELECTION = `${SRC}stream-selection/`;
const TEMPORAL_TAGS = `${SRC}temporal-tags/`;
const TESTING = `${SRC}testing/`;
const UTILS = `${SRC}utils/`;
const VIDEO = `${SRC}video/`;
const VIEWS = `${SRC}views/`;
const VIEWS_ENTRY = `${VIEWS}entry\\.tsx$`;
const VIEW_SESSION = `${VIEWS}session/`;
const VISUALIZATION = `${SRC}visualization/`;

const ENTERPRISE_SHARED_FACADES =
  `${SRC}(extensions/(grid-posters|timeline|tiles)/(index|runtime)\\.ts$|` +
  `extensions/episode-intervals/index\\.ts$|` +
  `extensions/(mcap-explorer|episode-actions)/index\\.ts$|` +
  `ir/index\\.ts$|query/bytes/index\\.ts$|temporal-tags/index\\.ts$|` +
  `utils/(bigint|cancellation|relative-time)\\.ts$|` +
  `views/episode/settings/controls/index\\.ts$|visualization/index\\.ts$)`;
const FORMAT_VENDORS =
  "(^|/)node_modules/(@mcap|@foxglove|hyparquet|mp4box)(/|$)|" +
  "^(@mcap/|@foxglove/|hyparquet$|mp4box$)";
const TEAMS =
  "^(teams-app/|packages/teams/)|" +
  "(^|/)node_modules/@fiftyone/teams-multimodal(/|$)|" +
  "^@fiftyone/teams-multimodal$";
const REACT_UI =
  "(^|/)node_modules/(react(?:-dom)?|@react-three/[^/]+|@voxel51/voodo)(/|$)|" +
  "^packages/(components|tiling)/|^packages/playback/(?!headless\\.ts$)";

const MCAP = `${ADAPTERS}mcap/`;
const MCAP_INSTRUMENTATION = `${MCAP}instrumentation/`;
const MCAP_INSTRUMENTATION_HOST = `${MCAP_INSTRUMENTATION}host/`;
const MCAP_METERS = `${MCAP_INSTRUMENTATION}meters/`;
const MCAP_FOUNDATIONS =
  `${MCAP}(acquisition|compatibility|contracts|instrumentation/meters|` +
  `normalization|synchronization|transforms)/`;
const MCAP_MESSAGE_DECODERS = `${MCAP}message-decoders/`;
const MCAP_READER = `${MCAP}reader/`;
const MCAP_RESOURCE_CLIENT = `${MCAP}resource-client/`;
const MCAP_WORKER = `${MCAP}worker/`;
const MCAP_WORKER_HOST = `${MCAP}worker-host/`;

const VISUALIZATION_FAMILIES = `${VISUALIZATION}(media-2d|logs|message|plot|scene-3d)/`;

module.exports = {
  forbidden: [
    {
      // Keep the stateful video engine framework-independent except for its
      // explicit React subscription adapter.
      name: "video-imports-only-video-foundations",
      severity: "error",
      from: { path: VIDEO, pathNot: TEST_MODULE },
      to: {
        path: SRC,
        pathNot: `${SRC}(?:video/(?!react\\.tsx$)|(?:ir|codecs|utils)/)`,
      },
    },
    {
      // Reject missing targets before architecture rules run so an unresolved
      // import cannot disappear from the graph and create a false pass.
      name: "no-unresolved-dependencies",
      severity: "error",
      from: { path: SRC },
      to: { couldNotResolve: true },
    },
    {
      // Keep the complete local source graph acyclic so ownership cannot be
      // reversed through barrels, type-only imports, or registries.
      name: "no-circular-dependencies",
      severity: "error",
      from: { path: SRC },
      to: { circular: true },
    },
    {
      // Keep production behavior independent of integration harnesses and
      // shared test fixtures, which may depend on much broader surfaces.
      name: "production-does-not-import-testing",
      severity: "error",
      from: { path: SRC, pathNot: TEST_MODULE },
      to: { path: TESTING },
    },
    {
      // Prevent production modules from reaching colocated tests or helpers;
      // tests remain visible to resolution and cycle analysis themselves.
      name: "production-does-not-import-test-modules",
      severity: "error",
      from: { path: SRC, pathNot: TEST_MODULE },
      to: { path: TEST_MODULE },
    },
    {
      // Reserve the package root barrel for outside consumers so internal
      // modules use the narrow owner entrypoint and avoid public-API cycles.
      name: "package-internals-do-not-import-root-entrypoint",
      severity: "error",
      from: { path: SRC, pathNot: ROOT_ENTRY },
      to: { path: ROOT_ENTRY },
    },
    {
      // Keep format-vendor APIs inside adapters so every higher layer works
      // only with format-neutral ports and intermediate representations.
      name: "only-adapters-import-format-vendors",
      severity: "error",
      from: { path: SRC, pathNot: ADAPTERS },
      to: { path: FORMAT_VENDORS },
    },
    {
      // Views emit format-neutral observations and consume runtime ports;
      // adapter-specific translation belongs at the injection boundary.
      name: "views-do-not-import-adapters",
      severity: "error",
      from: { path: VIEWS, pathNot: TEST_MODULE },
      to: { path: ADAPTERS },
    },
    {
      // Keep each format adapter independent so adding one format cannot
      // create an implicit runtime dependency on another implementation.
      name: "adapters-do-not-import-other-adapters",
      severity: "error",
      from: { path: `${ADAPTERS}([^/]+)/`, pathNot: TEST_MODULE },
      to: { path: ADAPTERS, pathNot: `${ADAPTERS}$1/` },
    },
    {
      // Preserve the optional enterprise overlay: shared OSS modules must not
      // acquire a dependency on code that is absent from the OSS build.
      name: "shared-multimodal-does-not-import-enterprise",
      severity: "error",
      from: { path: SRC, pathNot: `${SRC}(enterprise/|inject/index\\.ts$)` },
      to: { path: ENTERPRISE },
    },
    {
      // Give enterprise wiring one auditable composition seam by allowing the
      // injection root to reach only the enterprise entry module.
      name: "inject-entry-imports-only-enterprise-entry",
      severity: "error",
      from: { path: INJECT_ENTRY },
      to: { path: ENTERPRISE, pathNot: `${ENTERPRISE}inject\\.ts$` },
    },
    {
      // Keep optional enterprise implementations on stable shared facades
      // instead of package internals that are intentionally free to evolve.
      name: "enterprise-imports-shared-only-through-facades",
      severity: "error",
      from: { path: ENTERPRISE },
      to: { path: SRC, pathNot: `${ENTERPRISE}|${ENTERPRISE_SHARED_FACADES}` },
    },
    {
      // Keep the OSS package independent of Teams source and package targets,
      // including targets resolved outside this package directory.
      name: "multimodal-does-not-import-teams",
      severity: "error",
      from: { path: SRC },
      to: { path: TEAMS },
    },
    {
      // Stop any non-view production layer from reaching view composition,
      // even transitively through a newly introduced namespace.
      name: "non-view-layers-do-not-reach-views",
      severity: "error",
      from: {
        path: SRC,
        pathNot: `${VIEWS}|${INJECT}|${ENTERPRISE}|${TEST_MODULE}`,
      },
      to: { path: VIEWS, reachable: true },
    },
    {
      // Allow only the injection root to execute the view entrypoint so an
      // ordinary import cannot trigger application registration side effects.
      name: "only-inject-imports-view-entry",
      severity: "error",
      from: { path: SRC, pathNot: `${INJECT_ENTRY}|${VIEWS_ENTRY}` },
      to: { path: VIEWS_ENTRY },
    },
    {
      // Keep outside episode callers on its public entry while allowing the
      // views composition root to define precise leaf lazy-load boundaries.
      name: "episode-production-callers-use-entrypoint",
      severity: "error",
      from: {
        path: SRC,
        pathNot: `${EPISODE}|${VIEWS_ENTRY}|${TEST_MODULE}`,
      },
      to: {
        path: EPISODE,
        pathNot: `${EPISODE_INDEX}|${EPISODE_SETTINGS_CONTROLS_INDEX}`,
      },
    },
    {
      // Keep episode implementation domains off their own public barrel so
      // canonical ownership remains visible and the barrel cannot form cycles.
      name: "episode-domains-do-not-import-entrypoint",
      severity: "error",
      from: { path: `${EPISODE}[^/]+/`, pathNot: TEST_MODULE },
      to: { path: EPISODE_INDEX },
    },
    {
      // The map renderer is episode-owned, but moving it under views must not
      // grant it access to arbitrary product or runtime composition.
      name: "episode-map-rendering-imports-only-map-and-rendering-foundations",
      severity: "error",
      from: { path: EPISODE_MAP_RENDERING, pathNot: TEST_MODULE },
      to: {
        path: SRC,
        pathNot: `${EPISODE}map/|${VISUALIZATION}|${IR}|${OBSERVABILITY}|${UTILS}`,
      },
    },
    {
      // Keep sample-to-session binding below every product surface so shared
      // lifecycle code cannot acquire rendering, layout, or feature policy.
      name: "view-session-imports-only-session-foundations",
      severity: "error",
      from: { path: VIEW_SESSION, pathNot: TEST_MODULE },
      to: {
        path: SRC,
        pathNot: `${SRC}(views/session|runtime|ports|ir|utils)/`,
      },
    },

    {
      // Keep format-neutral audio (PCM -> peaks, Web Audio playback)
      // independent of any container or adapter, so a non-MCAP audio dataset
      // drives it by supplying only an `AudioLoader`.
      name: "audio-imports-only-audio-foundations",
      severity: "error",
      from: { path: AUDIO, pathNot: TEST_MODULE },
      to: { path: SRC, pathNot: `${SRC}(audio|codecs|ir|utils)/` },
    },

    {
      // Define the complete internal dependency surface of adapters; a new
      // upward edge must be redesigned rather than silently grandfathered.
      name: "adapters-import-only-adapter-foundations",
      severity: "error",
      from: { path: ADAPTERS, pathNot: TEST_MODULE },
      to: {
        path: SRC,
        pathNot: `${SRC}(adapters|codecs|decoders|ir|observability|ports|query|schemas|stream-selection|utils)/|${POINT_CLOUD_RUNTIME_LEAVES}`,
      },
    },
    {
      // Keep bitstream codecs as low-level mechanisms with no dependency on
      // application models, orchestration, formats, or UI composition.
      name: "codecs-import-only-codec-foundations",
      severity: "error",
      from: { path: CODECS, pathNot: TEST_MODULE },
      to: { path: SRC, pathNot: `${SRC}(codecs|utils)/` },
    },
    {
      // Keep decoders as reusable transformations that produce IR and may use
      // only low-level codecs or genuinely domain-free utilities.
      name: "decoders-import-only-decoder-foundations",
      severity: "error",
      from: { path: DECODERS, pathNot: TEST_MODULE },
      to: { path: SRC, pathNot: `${SRC}(decoders|ir|codecs|utils)/` },
    },
    {
      // Keep extension contributions on host contracts rather than product UI
      // internals, source adapters, or sibling implementation details.
      name: "extensions-import-only-extension-foundations",
      severity: "error",
      from: { path: EXTENSIONS, pathNot: TEST_MODULE },
      to: {
        path: SRC,
        pathNot: `${SRC}(extensions|runtime|ports|ir|stream-selection)/`,
      },
    },
    {
      // Keep the injection namespace a composition root that wires only views,
      // runtime capabilities, adapters, and the optional enterprise entry.
      name: "inject-imports-only-composition-targets",
      severity: "error",
      from: { path: INJECT, pathNot: TEST_MODULE },
      to: {
        path: SRC,
        pathNot: `${SRC}(inject|views|runtime|adapters|enterprise)/`,
      },
    },
    {
      // Preserve IR as the innermost application data model so importing a
      // shared value never drags behavior, I/O, or framework code with it.
      name: "ir-is-an-application-leaf",
      severity: "error",
      from: { path: IR, pathNot: TEST_MODULE },
      to: { path: SRC, pathNot: IR },
    },
    {
      // Keep ports limited to their own contracts and IR value types so every
      // implementation can satisfy them without inheriting runtime policy.
      name: "ports-import-only-contract-foundations",
      severity: "error",
      from: { path: PORTS, pathNot: TEST_MODULE },
      to: { path: SRC, pathNot: `${SRC}(ports|ir)/` },
    },
    {
      // Keep query responsible for acquisition and decode orchestration without
      // reaching into runtime policy, adapters, generated schemas, or UI.
      name: "query-imports-only-query-foundations",
      severity: "error",
      from: { path: QUERY, pathNot: TEST_MODULE },
      to: { path: SRC, pathNot: `${SRC}(query|decoders|ir|codecs|utils)/` },
    },
    {
      // Keep runtime as the application-capability layer over ports and query;
      // it must not acquire view or format-specific responsibilities.
      name: "runtime-imports-only-runtime-foundations",
      severity: "error",
      from: { path: RUNTIME, pathNot: TEST_MODULE },
      to: {
        path: SRC,
        pathNot: `${SRC}(runtime|observability|ports|query|ir|utils)/`,
      },
    },
    {
      // Observation seams are neutral, headless leaves. Producers and adapter
      // sinks meet here without introducing a dependency between their owners.
      name: "observability-imports-only-neutral-foundations",
      severity: "error",
      from: { path: OBSERVABILITY, pathNot: TEST_MODULE },
      to: {
        path: SRC,
        pathNot: `${SRC}(observability|ir|ports|utils)/`,
      },
    },
    {
      // Keep scene inventory a small format-neutral policy domain over IR and
      // pure stream-selection rules, independent of sessions and rendering.
      name: "scene-inventory-imports-only-inventory-foundations",
      severity: "error",
      from: { path: SCENE_INVENTORY, pathNot: TEST_MODULE },
      to: {
        path: SRC,
        pathNot: `${SRC}(scene-inventory|ir|stream-selection)/`,
      },
    },
    {
      // Keep generated transport schemas passive: application namespaces may
      // consume them at adapter boundaries, but schemas consume no application.
      name: "schemas-are-application-leaves",
      severity: "error",
      from: { path: SCHEMAS, pathNot: TEST_MODULE },
      to: { path: SRC, pathNot: SCHEMAS },
    },
    {
      // Keep shared stream pairing and default-selection policy pure so adapters
      // and product policy can reuse it without depending on one another.
      name: "stream-selection-imports-only-selection-foundations",
      severity: "error",
      from: { path: STREAM_SELECTION, pathNot: TEST_MODULE },
      to: { path: SRC, pathNot: `${SRC}(stream-selection|ir|utils)/` },
    },
    {
      // The grid tile's interval lane composes the episode-interval seam over
      // the one open-source source (temporal tags) and the runtime's episode
      // time range. It is presentation only: nothing else may hang off it, and
      // it may not reach product views or source adapters.
      name: "grid-overlay-imports-only-interval-sources",
      severity: "error",
      from: { path: GRID_OVERLAY, pathNot: TEST_MODULE },
      to: {
        path: SRC,
        pathNot: `${SRC}(grid-overlay|extensions|temporal-tags|runtime|ir|utils)/`,
      },
    },
    {
      // Keep temporal-tag contributions format-neutral and dependent only on
      // runtime timing capabilities plus shared IR values.
      name: "temporal-tags-import-only-temporal-foundations",
      severity: "error",
      from: { path: TEMPORAL_TAGS, pathNot: TEST_MODULE },
      to: { path: SRC, pathNot: `${SRC}(temporal-tags|runtime|ir|utils)/` },
    },
    {
      // Keep utilities truly domain-free so any namespace may import them
      // without creating a hidden route back into application ownership.
      name: "utils-do-not-import-application-code",
      severity: "error",
      from: { path: UTILS, pathNot: TEST_MODULE },
      to: { path: SRC, pathNot: UTILS },
    },
    {
      // Define views as product composition over stable capabilities and
      // renderers; source acquisition and transport models remain below them.
      name: "views-import-only-product-foundations",
      severity: "error",
      from: { path: VIEWS, pathNot: TEST_MODULE },
      to: {
        path: SRC,
        pathNot: `${SRC}(views|runtime|observability|ports|scene-inventory|visualization|video|extensions|temporal-tags|ir|stream-selection|utils|audio)/`,
      },
    },
    {
      // Keep visualization focused on rendering prepared IR with low-level
      // codecs and utilities, never source acquisition or product policy.
      name: "visualization-imports-only-rendering-foundations",
      severity: "error",
      from: { path: VISUALIZATION, pathNot: TEST_MODULE },
      to: {
        path: SRC,
        pathNot: `${SRC}(visualization|video|observability|ir|codecs|utils)/|${POINT_CLOUD_RUNTIME_LEAVES}`,
      },
    },
    {
      // Let cross-layer integration tests assemble production boundaries while
      // still keeping them away from injection and enterprise composition.
      name: "testing-imports-only-testable-production-surfaces",
      severity: "error",
      from: { path: TESTING },
      to: {
        path: SRC,
        pathNot: `${SRC}(testing|adapters|codecs|decoders|extensions|ir|ports|query|runtime|scene-inventory|schemas|stream-selection|temporal-tags|utils|video|views|visualization)/`,
      },
    },

    {
      // The video state machine and decoder actor stay usable in headless tests;
      // React context/hooks live only in the named adapter.
      name: "video-core-is-headless",
      severity: "error",
      from: {
        path: VIDEO,
        pathNot: `${VIDEO}react\\.tsx$|${TEST_MODULE}`,
      },
      to: { path: REACT_UI },
    },
    {
      // Keep runtime core usable in workers and headless tests; framework hooks
      // belong only in the explicitly named runtime/react integration path.
      name: "runtime-core-is-headless",
      severity: "error",
      from: { path: RUNTIME, pathNot: `${RUNTIME}react/|${TEST_MODULE}` },
      to: { path: REACT_UI },
    },
    {
      // Keep scene inventory's model and policies framework-free; React context
      // bindings live only under the explicit scene-inventory/react subpath.
      name: "scene-inventory-core-is-headless",
      severity: "error",
      from: {
        path: SCENE_INVENTORY,
        pathNot: `${SCENE_INVENTORY}react/|${TEST_MODULE}`,
      },
      to: { path: REACT_UI },
    },
    {
      // Keep foundational namespaces importable in workers and non-browser
      // execution without transitively acquiring React or UI component trees.
      name: "foundational-namespaces-are-headless",
      severity: "error",
      from: {
        path: `${SRC}(ir|ports|decoders|query|schemas|codecs|stream-selection|utils)/`,
        pathNot: TEST_MODULE,
      },
      to: { path: REACT_UI },
    },
    {
      // Neutral observation contracts remain safe in workers and headless tests.
      name: "observability-is-headless",
      severity: "error",
      from: { path: OBSERVABILITY, pathNot: TEST_MODULE },
      to: { path: REACT_UI },
    },
    {
      // Keep MCAP implementation layers headless. Main-thread coordination and
      // browser reporting are explicitly owned by worker-host/ and
      // instrumentation/host/, which are intentionally excluded here.
      name: "mcap-core-layers-are-headless",
      severity: "error",
      from: {
        path: `${MCAP}(acquisition|compatibility|contracts|instrumentation/meters|message-decoders|normalization|reader|resource-client|synchronization|transforms|worker)/`,
        pathNot: TEST_MODULE,
      },
      to: { path: REACT_UI },
    },
    {
      // LeRobot decoding and resource access must remain usable outside React
      // and browser-owned UI composition.
      name: "lerobot-adapter-is-headless",
      severity: "error",
      from: { path: `${ADAPTERS}lerobot/`, pathNot: TEST_MODULE },
      to: { path: REACT_UI },
    },

    {
      // Keep raw byte acquisition below decoding so cache and transport policy
      // never gains a dependency on decoded-result orchestration.
      name: "query-bytes-does-not-import-decoding",
      severity: "error",
      from: { path: `${QUERY}bytes/`, pathNot: TEST_MODULE },
      to: { path: `${QUERY}decoding/` },
    },
    {
      // Ensure schema conversion happens only at adapter boundaries; product,
      // runtime, query, decoder, and rendering layers consume IR instead.
      name: "only-adapters-import-generated-schemas",
      severity: "error",
      from: { path: SRC, pathNot: `${ADAPTERS}|${SCHEMAS}|${TEST_MODULE}` },
      to: { path: SCHEMAS },
    },

    {
      // Keep interaction primitives and common panel UI below every semantic
      // renderer so a foundation cannot smuggle a feature dependency downward.
      name: "visualization-interaction-and-panel-ui-are-leaves",
      severity: "error",
      from: {
        path: `${VISUALIZATION}(interaction|panel-ui)/`,
        pathNot: TEST_MODULE,
      },
      to: {
        path: VISUALIZATION,
        pathNot: `${VISUALIZATION}(interaction|panel-ui)/`,
      },
    },
    {
      // Keep WebGPU as generic rendering infrastructure; semantic projection
      // and scene composition belong to named higher visualization domains.
      name: "visualization-webgpu-is-infrastructure",
      severity: "error",
      from: { path: `${VISUALIZATION}webgpu/`, pathNot: TEST_MODULE },
      to: {
        path: VISUALIZATION,
        pathNot: `${VISUALIZATION}(webgpu|interaction|panel-ui)/`,
      },
    },
    {
      // Keep 2D media, logs, map, message, plot, and scene-3D independently
      // reusable; cross-family rendering belongs in visualization/composition.
      name: "visualization-families-do-not-import-siblings",
      severity: "error",
      from: { path: VISUALIZATION_FAMILIES, pathNot: TEST_MODULE },
      to: { path: VISUALIZATION_FAMILIES, pathNot: `${VISUALIZATION}$1/` },
    },
    {
      // Preserve composition as the upper cross-family layer so a semantic
      // renderer never acquires a dependency on the experience combining it.
      name: "visualization-families-do-not-import-composition",
      severity: "error",
      from: { path: VISUALIZATION_FAMILIES, pathNot: TEST_MODULE },
      to: { path: `${VISUALIZATION}composition/` },
    },

    {
      // Keep extension families independent so they integrate through host
      // contracts rather than importing a sibling contribution implementation.
      name: "extension-families-do-not-import-each-other",
      severity: "error",
      from: {
        path: `${EXTENSIONS}(?!host/)([^/]+)/`,
        pathNot: TEST_MODULE,
      },
      to: {
        path: EXTENSIONS,
        pathNot: `${EXTENSIONS}$1/|${EXTENSION_HOST}`,
      },
    },
    {
      // Host contracts are the foundation shared by extension families. The
      // host must never acquire a dependency on a concrete contribution.
      name: "extension-host-does-not-import-families",
      severity: "error",
      from: { path: EXTENSION_HOST, pathNot: TEST_MODULE },
      to: { path: EXTENSIONS, pathNot: EXTENSION_HOST },
    },
    {
      // Keep episode features, settings, and persistence off the concrete tile
      // catalog; they use leaf contracts, direct ownership, or host commands.
      name: "episode-features-do-not-import-tile-catalog",
      severity: "error",
      from: {
        path: `${EPISODE}(image|layout|logs|map|plots|raw|scene|settings)/`,
        pathNot: TEST_MODULE,
      },
      to: { path: `${EPISODE}tiles/episode-tile-catalog\\.ts$` },
    },

    {
      // Keep named MCAP contracts and pure foundations at the bottom of the
      // adapter graph so every implementation stratum may reuse them safely.
      name: "mcap-foundations-import-only-foundations",
      severity: "error",
      from: { path: MCAP_FOUNDATIONS, pathNot: TEST_MODULE },
      to: { path: MCAP, pathNot: MCAP_FOUNDATIONS },
    },
    {
      // Keep all MCAP instrumentation below the adapter facade. Worker-safe
      // meters are constrained further by the foundation rule above; host
      // reporters may interpret lower-layer observations but cannot compose
      // the adapter facade.
      name: "mcap-instrumentation-imports-only-instrumentation-foundations",
      severity: "error",
      from: { path: MCAP_INSTRUMENTATION, pathNot: TEST_MODULE },
      to: {
        path: MCAP,
        pathNot:
          `${MCAP_INSTRUMENTATION}|${MCAP}(worker|resource-client|reader|` +
          `message-decoders|acquisition|compatibility|contracts|normalization|` +
          `synchronization|transforms)/`,
      },
    },
    {
      // Keep concrete MCAP message decoders below readers, the resource client,
      // workers, and the adapter facade.
      name: "mcap-message-decoders-import-only-decoder-foundations",
      severity: "error",
      from: { path: MCAP_MESSAGE_DECODERS, pathNot: TEST_MODULE },
      to: {
        path: MCAP,
        pathNot:
          `${MCAP}(message-decoders|compatibility|contracts|normalization|` +
          `synchronization|transforms)/|${MCAP_METERS}`,
      },
    },
    {
      // Keep MCAP indexed readers independent of resource scheduling and worker
      // transport; they may use only reader, decoder, and shared foundations.
      name: "mcap-reader-imports-only-reader-foundations",
      severity: "error",
      from: { path: MCAP_READER, pathNot: TEST_MODULE },
      to: {
        path: MCAP,
        pathNot:
          `${MCAP}(reader|message-decoders|compatibility|contracts|` +
          `normalization|synchronization|transforms)/|${MCAP_METERS}`,
      },
    },
    {
      // Keep MCAP resources as the orchestration layer over readers and
      // decoders without reaching upward into worker or facade composition.
      name: "mcap-resource-client-imports-only-resource-foundations",
      severity: "error",
      from: { path: MCAP_RESOURCE_CLIENT, pathNot: TEST_MODULE },
      to: {
        path: MCAP,
        pathNot:
          `${MCAP}(resource-client|reader|message-decoders|compatibility|` +
          `contracts|normalization|synchronization|transforms)/|${MCAP_METERS}`,
      },
    },
    {
      // Keep MCAP workers above resources but below the adapter facade so
      // background execution cannot depend on its own public composition API.
      name: "mcap-worker-imports-only-worker-foundations",
      severity: "error",
      from: { path: MCAP_WORKER, pathNot: TEST_MODULE },
      to: {
        path: MCAP,
        pathNot:
          `${MCAP}(worker|resource-client|reader|message-decoders|` +
          `compatibility|contracts|normalization|synchronization|transforms)/|` +
          MCAP_METERS,
      },
    },
    {
      // Main-thread worker coordination may consume the worker transport,
      // lower MCAP strata, and host instrumentation, but not the adapter
      // facade or unrelated root-level composition.
      name: "mcap-worker-host-imports-only-host-foundations",
      severity: "error",
      from: { path: MCAP_WORKER_HOST, pathNot: TEST_MODULE },
      to: {
        path: MCAP,
        pathNot:
          `${MCAP}(worker-host|worker|resource-client|reader|message-decoders|` +
          `acquisition|compatibility|contracts|normalization|synchronization|` +
          `transforms)/|${MCAP_INSTRUMENTATION_HOST}|${MCAP_METERS}`,
      },
    },
  ],
  required: [
    {
      // Force every root TypeScript responsibility into a named namespace so
      // only the package's deliberate public entrypoint remains flat.
      name: "no-flat-multimodal-source-files",
      severity: "error",
      module: { path: `${SRC}(?!index\\.ts$)[^/]+\\.tsx?$` },
      to: { path: "^$" },
    },
    {
      // Keep the views root as the explicit registration entrypoint; shared
      // binding and product implementation belong to named view domains.
      name: "no-flat-views-typescript-files",
      severity: "error",
      module: { path: `${VIEWS}(?!entry\\.tsx$)[^/]+\\.tsx?$` },
      to: { path: "^$" },
    },
    {
      // Force episode implementation files into product domains so its root
      // stays a deliberate entrypoint instead of becoming a second flat dump.
      name: "no-flat-episode-typescript-files",
      severity: "error",
      module: { path: `${EPISODE}(?!index\\.ts$)[^/]+\\.tsx?$` },
      to: { path: "^$" },
    },
  ],
  options: {
    // Preserve outside dependencies as visible leaf targets while preventing
    // Dependency Cruiser from walking vendor and workspace implementation trees.
    doNotFollow: { path: "^(?!packages/multimodal/src/)" },
    // Resolve modern package export maps and ESM declaration extensions so
    // the unresolved-import rule agrees with Vite and TypeScript resolution.
    enhancedResolveOptions: {
      conditionNames: ["import", "require", "node", "default", "types"],
      exportsFields: ["exports"],
      extensions: [
        ".ts",
        ".tsx",
        ".mts",
        ".cts",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".d.ts",
        ".d.mts",
        ".d.cts",
        ".json",
      ],
      mainFields: ["module", "main", "types", "typings"],
    },
    tsPreCompilationDeps: true,
  },
};
