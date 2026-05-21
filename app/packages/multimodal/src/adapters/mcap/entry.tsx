import type { SampleRendererProps } from "@fiftyone/plugins";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import MultiModalPlayback from "../../components/MultiModalPlayback/MultiModalPlayback";
import { GridRenderer } from "./react";
import { McapStreams } from "./react/McapStreams";
import { useStableMcapSource } from "./react/use-stable-mcap-source";

function McapModalRenderer({ ctx }: SampleRendererProps) {
  const source = useStableMcapSource(ctx);
  const fileName = source?.sourceId.split("/").pop() ?? "recording.mcap";

  return (
    <MultiModalPlayback
      fileName={fileName}
      defaultLeftOpen={false}
      defaultRightOpen={false}
    >
      <McapStreams ctx={ctx} />
    </MultiModalPlayback>
  );
}

registerComponent({
  name: "McapRenderer",
  label: "Mcap Renderer",
  component: McapModalRenderer,
  type: PluginComponentType.SampleRenderer,
  activator: () => true,
  sampleRendererOptions: {
    supports: { extensions: ["mcap"] },
    grid: {
      enabled: true,
      overrideComponent: GridRenderer,
    },
  },
});
