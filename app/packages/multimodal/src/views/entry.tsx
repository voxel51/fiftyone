import {
  PluginComponentType,
  registerComponent,
  SAMPLE_RENDERER_GRID_SLOT,
} from "@fiftyone/plugins";
import React, { lazy, Suspense } from "react";

const LazyModalRenderer = lazy(() => import("./EpisodeModalRenderer"));
const LazyGridRenderer = lazy(() => import("./EpisodeGridRenderer"));
const LazyGridStreamSelector = lazy(
  () => import("./EpisodeGridStreamSelector"),
);
const LazyExplorer = lazy(() => import("./EpisodeExplorer"));
const LazyExplorerIcon = lazy(() => import("./EpisodeExplorerIcon"));

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
const EpisodeExplorer = withSuspense(LazyExplorer);
const EpisodeExplorerIcon = withSuspense(LazyExplorerIcon);

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
    name: "AnyMcapViewer",
    label: "MCAP Explorer",
    Icon: EpisodeExplorerIcon,
    component: EpisodeExplorer,
    type: PluginComponentType.Panel,
    activator: (ctx) => ctx.dataset?.mediaType === "multimodal",
    panelOptions: { allowDuplicates: true, surfaces: "grid" },
  });
}
