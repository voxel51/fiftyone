import type { SampleRendererProps } from "@fiftyone/plugins";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSampleRendererTags, useSampleTemporalTags } from "./hooks";
import type {
  Tag,
  TagCreate,
  TagsClient,
  UseSampleTagsOptions,
  UseSampleTagsResult,
} from "./types";

afterEach(() => {
  cleanup();
});

describe("useSampleTemporalTags", () => {
  it("stays idle without a sample scope", () => {
    const client = createTagsClient();

    render(
      <TemporalTagsHarness
        options={{ client, datasetId: "dataset-id", sampleId: undefined }}
      />
    );

    expect(screen.getByTestId("temporal-tags").textContent).toBe("idle::");
    expect(client.listSampleTags).not.toHaveBeenCalled();
  });

  it("loads sample temporal tags", async () => {
    const client = createTagsClient({
      listSampleTags: vi.fn(async () => [createTemporalTag("tag-a")]),
    });

    render(
      <TemporalTagsHarness
        options={{
          client,
          datasetId: "dataset-id",
          sampleId: "sample-id",
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("temporal-tags").textContent).toBe(
        "ready:tag-a:"
      );
    });
    expect(client.listSampleTags).toHaveBeenCalledWith({
      datasetId: "dataset-id",
      filter: undefined,
      sampleId: "sample-id",
    });
  });

  it("refetches when the sample id or filter changes", async () => {
    const client = createTagsClient({
      listSampleTags: vi.fn(async ({ filter, sampleId }) => [
        createTemporalTag(`${sampleId}-${filter?.start ?? 0}`),
      ]),
    });

    const { rerender } = render(
      <TemporalTagsHarness
        options={{
          client,
          datasetId: "dataset-id",
          filter: { start: 1 },
          sampleId: "sample-a",
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("temporal-tags").textContent).toBe(
        "ready:sample-a-1:"
      );
    });

    rerender(
      <TemporalTagsHarness
        options={{
          client,
          datasetId: "dataset-id",
          filter: { start: 2 },
          sampleId: "sample-b",
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("temporal-tags").textContent).toBe(
        "ready:sample-b-2:"
      );
    });
    expect(client.listSampleTags).toHaveBeenCalledTimes(2);
  });

  it("ignores stale async responses after a rerender", async () => {
    const first = deferred<readonly Tag[]>();
    const second = deferred<readonly Tag[]>();
    const client = createTagsClient({
      listSampleTags: vi.fn(({ sampleId }) =>
        sampleId === "sample-a" ? first.promise : second.promise
      ),
    });

    const { rerender } = render(
      <TemporalTagsHarness
        options={{
          client,
          datasetId: "dataset-id",
          sampleId: "sample-a",
        }}
      />
    );

    await waitFor(() => {
      expect(client.listSampleTags).toHaveBeenCalledTimes(1);
    });

    rerender(
      <TemporalTagsHarness
        options={{
          client,
          datasetId: "dataset-id",
          sampleId: "sample-b",
        }}
      />
    );

    await waitFor(() => {
      expect(client.listSampleTags).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      second.resolve([createTemporalTag("sample-b")]);
      await second.promise;
    });
    expect(screen.getByTestId("temporal-tags").textContent).toBe(
      "ready:sample-b:"
    );

    await act(async () => {
      first.resolve([createTemporalTag("sample-a")]);
      await first.promise;
    });
    expect(screen.getByTestId("temporal-tags").textContent).toBe(
      "ready:sample-b:"
    );
  });

  it("exposes mutation helpers and reloads after successful mutations", async () => {
    const client = createTagsClient();
    const createInput: TagCreate = {
      end: 2,
      start: 1,
      tag: "review",
    };
    let latest!: UseSampleTagsResult;

    render(
      <TemporalTagsHarness
        onState={(state) => {
          latest = state;
        }}
        options={{
          client,
          datasetId: "dataset-id",
          sampleId: "sample-id",
        }}
      />
    );

    await waitFor(() => {
      expect(latest.status).toBe("ready");
    });

    await act(async () => {
      await latest.create([createInput]);
    });
    expect(client.createSampleTags).toHaveBeenCalledWith({
      datasetId: "dataset-id",
      sampleId: "sample-id",
      tags: [createInput],
    });
    expect(client.listSampleTags).toHaveBeenCalledTimes(2);

    await act(async () => {
      await latest.update("temporal-tag-id", { end: 3 });
    });
    expect(client.updateSampleTag).toHaveBeenCalledWith({
      datasetId: "dataset-id",
      sampleId: "sample-id",
      tagId: "temporal-tag-id",
      update: { end: 3 },
    });
    expect(client.listSampleTags).toHaveBeenCalledTimes(3);

    await act(async () => {
      await latest.delete(["temporal-tag-id"]);
    });
    expect(client.deleteSampleTags).toHaveBeenCalledWith({
      datasetId: "dataset-id",
      ids: ["temporal-tag-id"],
      sampleId: "sample-id",
    });
    expect(client.listSampleTags).toHaveBeenCalledTimes(4);

    await act(async () => {
      await latest.clear({ tags: ["review"] });
    });
    expect(client.clearSampleTags).toHaveBeenCalledWith({
      datasetId: "dataset-id",
      filter: { tags: ["review"] },
      sampleId: "sample-id",
    });
    expect(client.listSampleTags).toHaveBeenCalledTimes(5);
  });

  it("surfaces client errors", async () => {
    const client = createTagsClient({
      listSampleTags: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    render(
      <TemporalTagsHarness
        options={{
          client,
          datasetId: "dataset-id",
          sampleId: "sample-id",
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("temporal-tags").textContent).toBe(
        "error::boom"
      );
    });
  });
});

describe("useSampleRendererTags", () => {
  it("derives the sample scope from a sample renderer context", async () => {
    const client = createTagsClient();
    const ctx = {
      dataset: { datasetId: "dataset-id" },
      sample: { sample: { _id: "sample-id" } },
    } as SampleRendererProps["ctx"];

    render(<SampleRendererTagsHarness client={client} ctx={ctx} />);

    await waitFor(() => {
      expect(client.listSampleTags).toHaveBeenCalledWith({
        datasetId: "dataset-id",
        filter: undefined,
        sampleId: "sample-id",
      });
    });
  });
});

function TemporalTagsHarness({
  onState,
  options,
}: {
  readonly onState?: (state: UseSampleTagsResult) => void;
  readonly options: UseSampleTagsOptions;
}) {
  const state = useSampleTemporalTags(options);

  useEffect(() => {
    onState?.(state);
  }, [onState, state]);

  return (
    <div data-testid="temporal-tags">
      {state.status}:{state.tags.map((tag) => tag.id).join(",")}:
      {state.error ?? ""}
    </div>
  );
}

function SampleRendererTagsHarness({
  client,
  ctx,
}: {
  readonly client: TagsClient;
  readonly ctx: SampleRendererProps["ctx"];
}) {
  useSampleRendererTags(ctx, { client });

  return null;
}

function createTagsClient(overrides: Partial<TagsClient> = {}): TagsClient {
  return {
    clearSampleTags: vi.fn(async () => 1),
    countDatasetTags: vi.fn(async () => ({})),
    createSampleTags: vi.fn(async () => [createTemporalTag("created")]),
    deleteSampleTags: vi.fn(async () => 1),
    listDatasetTags: vi.fn(async () => []),
    listSampleTags: vi.fn(async () => []),
    updateSampleTag: vi.fn(async () => createTemporalTag("updated")),
    ...overrides,
  };
}

function createTemporalTag(id: string): Tag {
  return {
    end: 2,
    id,
    indexType: 2,
    sampleId: "sample-id",
    start: 1,
    tag: "review",
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
}
