import type { SampleRendererProps } from "@fiftyone/plugins";
import type { TemporalTag, TemporalTagsClient } from "@fiftyone/state";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSampleRendererTemporalTags } from "./hooks";

afterEach(() => {
  cleanup();
});

describe("useSampleRendererTemporalTags", () => {
  it("derives the sample scope from a sample renderer context", async () => {
    const client = createTemporalTagsClient();
    const ctx = {
      dataset: { datasetId: "dataset-id" },
      sample: { sample: { _id: "sample-id" } },
    } as SampleRendererProps["ctx"];

    render(<SampleRendererTemporalTagsHarness client={client} ctx={ctx} />);

    await waitFor(() => {
      expect(client.listSampleTemporalTags).toHaveBeenCalledWith({
        datasetId: "dataset-id",
        filter: undefined,
        sampleId: "sample-id",
      });
    });
  });
});

function SampleRendererTemporalTagsHarness({
  client,
  ctx,
}: {
  readonly client: TemporalTagsClient;
  readonly ctx: SampleRendererProps["ctx"];
}) {
  useSampleRendererTemporalTags(ctx, { client });

  return null;
}

function createTemporalTagsClient(
  overrides: Partial<TemporalTagsClient> = {},
): TemporalTagsClient {
  return {
    clearSampleTemporalTags: vi.fn(async () => 1),
    countDatasetTemporalTags: vi.fn(async () => ({})),
    createSampleTemporalTags: vi.fn(async () => [createTemporalTag("created")]),
    deleteSampleTemporalTags: vi.fn(async () => 1),
    listDatasetTemporalTags: vi.fn(async () => []),
    listSampleTemporalTags: vi.fn(async () => []),
    updateSampleTemporalTag: vi.fn(async () => createTemporalTag("updated")),
    ...overrides,
  };
}

function createTemporalTag(id: string): TemporalTag {
  return {
    end: 2,
    id,
    indexType: 2,
    sampleId: "sample-id",
    start: 1,
    tag: "review",
  };
}
