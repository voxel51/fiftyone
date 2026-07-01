import {
  PluginComponentType,
  registerComponent,
  SAMPLE_RENDERER_GRID_SLOT,
  type SampleRendererProps,
  type SampleRendererRegistration,
  useActivePlugins,
} from "./index";

const PanelComponent = () => null;
const GridHeaderComponent = () => null;
const RendererComponent = (_props: SampleRendererProps) => null;

export function typecheckRegisterComponent() {
  registerComponent({
    name: "panel",
    label: "Panel",
    component: PanelComponent,
    type: PluginComponentType.Panel,
    activator: () => true,
    panelOptions: {
      priority: 1,
    },
  });

  registerComponent({
    name: "renderer",
    label: "Renderer",
    component: RendererComponent,
    type: PluginComponentType.SampleRenderer,
    activator: () => true,
    sampleRendererOptions: {
      supports: { extensions: ["pdf"] },
      grid: {
        enabled: true,
        slots: {
          [SAMPLE_RENDERER_GRID_SLOT.HEADER_AFTER_RESOURCE_COUNT]:
            GridHeaderComponent,
        },
      },
    },
  });

  // @ts-expect-error Panel registrations cannot declare sampleRendererOptions
  registerComponent({
    name: "invalid-panel",
    label: "Invalid panel",
    component: PanelComponent,
    type: PluginComponentType.Panel,
    activator: () => true,
    sampleRendererOptions: {
      supports: { extensions: ["pdf"] },
    },
  });

  // @ts-expect-error Sample renderer registrations cannot declare panelOptions
  registerComponent({
    name: "invalid-renderer",
    label: "Invalid renderer",
    component: RendererComponent,
    type: PluginComponentType.SampleRenderer,
    activator: () => true,
    panelOptions: {
      priority: 1,
    },
    sampleRendererOptions: {
      supports: { extensions: ["pdf"] },
    },
  });
}

export function typecheckUseActivePlugins() {
  const sampleRenderers = useActivePlugins(
    PluginComponentType.SampleRenderer,
    {},
  );
  const _sampleRenderers: SampleRendererRegistration[] = sampleRenderers;

  return _sampleRenderers;
}
