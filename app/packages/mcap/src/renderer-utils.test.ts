import {
  createSampleRendererRenderContext,
  type SampleRendererRenderContext,
} from "@fiftyone/plugins";
import { describe, expect, it } from "vitest";
import { getMcapRendererInfo, getMcapSceneParams } from "./renderer-utils";

const dataset = {
  id: "dataset-1",
  name: "multimodal-dataset",
} as const;
const schema = { filepath: { ftype: "StringField" } } as const;

function createCtx() {
  return createSampleRendererRenderContext(
    {
      sample: {
        _id: "sample-1",
        filepath: "/tmp/sensors/drive.mcap",
        media_type: "unknown",
      },
      urls: [{ field: "filepath", url: "/tmp/sensors/drive.mcap" }],
    },
    "filepath",
    dataset as any,
    schema as any,
    "modal"
  ) as SampleRendererRenderContext;
}

describe("renderer utils", () => {
  it("extracts stable renderer info and scene-open request params", () => {
    const ctx = createCtx();
    const info = getMcapRendererInfo(ctx);

    expect(info.datasetId).toBe("dataset-1");
    expect(info.sampleId).toBe("sample-1");
    expect(info.mediaField).toBe("filepath");
    expect(info.mediaPath).toBe("/tmp/sensors/drive.mcap");
    expect(getMcapSceneParams(ctx)).toEqual({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      mediaField: "filepath",
    });
  });
});
