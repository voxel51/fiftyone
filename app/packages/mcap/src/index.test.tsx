import {
  createSampleRendererRenderContext,
  getByType,
  getComponent,
  getMatchingSampleRenderer,
  getSampleRendererComponent,
  PluginComponentType,
} from "@fiftyone/plugins";
import { describe, expect, it } from "vitest";

const dataset = { name: "dataset" } as const;
const schema = { filepath: { ftype: "StringField" } } as const;

function createSample(path: string) {
  return {
    sample: {
      filepath: path,
      media_type: "unknown",
    },
    urls: [{ field: "filepath", url: path }],
  } as const;
}

describe("@fiftyone/multimodal registration", () => {
  it("registers a multimodal renderer that matches `.mcap` media in modal and grid", async () => {
    const module = await import("./index");
    const registration = getByType(PluginComponentType.SampleRenderer).find(
      (entry) => entry.name === module.MULTIMODAL_SAMPLE_RENDERER_NAME
    );

    expect(registration).toBeDefined();

    const modalCtx = createSampleRendererRenderContext(
      createSample("/tmp/run.mcap"),
      "filepath",
      dataset as any,
      schema as any,
      "modal"
    );
    const gridCtx = createSampleRendererRenderContext(
      createSample("/tmp/run.mcap"),
      "filepath",
      dataset as any,
      schema as any,
      "grid"
    );
    const nonMcapCtx = createSampleRendererRenderContext(
      createSample("/tmp/run.bin"),
      "filepath",
      dataset as any,
      schema as any,
      "modal"
    );

    expect(getMatchingSampleRenderer([registration!], modalCtx)?.name).toBe(
      module.MULTIMODAL_SAMPLE_RENDERER_NAME
    );
    expect(getMatchingSampleRenderer([registration!], gridCtx)?.name).toBe(
      module.MULTIMODAL_SAMPLE_RENDERER_NAME
    );
    expect(getMatchingSampleRenderer([registration!], nonMcapCtx)).toBeNull();
  });

  it("uses the modal renderer as canonical and the grid renderer as the override", async () => {
    const module = await import("./index");
    const registration = getByType(PluginComponentType.SampleRenderer).find(
      (entry) => entry.name === module.MULTIMODAL_SAMPLE_RENDERER_NAME
    );

    expect(registration).toBeDefined();

    const canonicalRenderer = getComponent(
      module.MULTIMODAL_SAMPLE_RENDERER_NAME
    );

    expect(canonicalRenderer).toBe(module.MultimodalModalRenderer);
    expect(
      getSampleRendererComponent(registration!, "grid", canonicalRenderer)
    ).toBe(module.MultimodalGridRenderer);
  });
});
