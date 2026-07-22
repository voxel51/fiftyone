import {
  PluginComponentType,
  registerComponent,
  SAMPLE_RENDERER_GRID_SLOT,
} from "@fiftyone/plugins";
import React, { lazy, Suspense } from "react";

const LazyModalRenderer = lazy(
  () => import("./episode/shell/EpisodeModalRenderer"),
);
const LazyGridRenderer = lazy(() =>
  import("./episode/grid/GridRenderer").then(({ GridRenderer }) => ({
    default: GridRenderer,
  })),
);
const LazyGridStreamSelector = lazy(() =>
  import("./episode/grid/EpisodeGridStreamSelector").then(
    ({ EpisodeGridStreamSelector }) => ({
      default: EpisodeGridStreamSelector,
    }),
  ),
);
const LazyMcapExplorer = lazy(
  () => import("./mcap-explorer/McapExplorerPanel"),
);
const LazyMcapExplorerIcon = lazy(
  () => import("./mcap-explorer/McapExplorerIcon"),
);

function withSuspense<T extends object>(
  Component: React.ComponentType<T>,
): React.FC<T> {
  return function SuspendedComponent(props: T) {
    return (
      <Suspense fallback={null}>
        <Component {...props} />
      </Suspense>
    );
  };
}

const EpisodeModalRenderer = withSuspense(LazyModalRenderer);
const EpisodeGridRenderer = withSuspense(LazyGridRenderer);
const EpisodeGridStreamSelector = withSuspense(LazyGridStreamSelector);
const McapExplorer = withSuspense(LazyMcapExplorer);
const McapExplorerIcon = withSuspense(LazyMcapExplorerIcon);

let registered = false;

/** Registers lightweight episode view shells whose heavy graphs load on use. */
export function registerEpisodeViews(): void {
  if (registered) return;
  registered = true;
  registerComponent({
    name: "EpisodeRenderer",
    label: "Episode Renderer",
    component: EpisodeModalRenderer,
    type: PluginComponentType.SampleRenderer,
    activator: (ctx) => ctx.dataset?.mediaType === "multimodal",
    sampleRendererOptions: {
      supports: { extensions: ["mcap"] },
      modal: { persistAcrossSamples: true },
      grid: {
        clickBehavior: "passthrough",
        enabled: true,
        overrideComponent: EpisodeGridRenderer,
        slots: {
          [SAMPLE_RENDERER_GRID_SLOT.HEADER_AFTER_RESOURCE_COUNT]:
            EpisodeGridStreamSelector,
        },
      },
    },
  });
  registerComponent({
    name: "McapExplorerPanel",
    label: "MCAP Explorer",
    Icon: McapExplorerIcon,
    component: McapExplorer,
    type: PluginComponentType.Panel,
    activator: (ctx) => ctx.dataset?.mediaType === "multimodal",
    panelOptions: { allowDuplicates: true, surfaces: "grid" },
  });
}
