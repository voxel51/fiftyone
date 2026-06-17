import { describe, expect, it, vi } from "vitest";
import { createTagsClient } from "./client";

type FetchConfig = {
  readonly body?: unknown;
  readonly method: string;
  readonly path: string;
};

describe("createTagsClient", () => {
  it("builds canonical route paths for every operation", async () => {
    const fetchFunction = createFetch(responseForRoute);
    const client = createTagsClient({
      fetchFunction: fetchFunction as never,
    });

    await client.listSampleTags({
      datasetId: "dataset-id",
      sampleId: "sample-id",
    });
    await client.createSampleTags({
      datasetId: "dataset-id",
      sampleId: "sample-id",
      tags: [createTagInput()],
    });
    await client.updateSampleTag({
      datasetId: "dataset-id",
      sampleId: "sample-id",
      tagId: "tag-id",
      update: { end: 4 },
    });
    await client.deleteSampleTags({
      datasetId: "dataset-id",
      sampleId: "sample-id",
      ids: ["tag-id"],
    });
    await client.clearSampleTags({
      datasetId: "dataset-id",
      sampleId: "sample-id",
    });
    await client.listDatasetTags({ datasetId: "dataset-id" });
    await client.countDatasetTags({ datasetId: "dataset-id" });

    expect(
      fetchFunction.mock.calls.map(([config]) => routeKey(config))
    ).toEqual([
      "GET /dataset/dataset-id/sample/sample-id/tags",
      "POST /dataset/dataset-id/sample/sample-id/tags",
      "PATCH /dataset/dataset-id/sample/sample-id/tags/tag-id",
      "DELETE /dataset/dataset-id/sample/sample-id/tags",
      "DELETE /dataset/dataset-id/sample/sample-id/tags",
      "GET /dataset/dataset-id/tags",
      "GET /dataset/dataset-id/tags/counts",
    ]);
  });

  it("serializes repeated filter query params", async () => {
    const fetchFunction = createFetch({ tags: [] });
    const client = createTagsClient({
      fetchFunction: fetchFunction as never,
    });

    await client.listSampleTags({
      datasetId: "dataset id",
      filter: {
        anchors: ["lidar_top", "camera_front"],
        end: 20,
        indexType: 2,
        start: 10,
        tags: ["review", "interesting"],
      },
      sampleId: "sample/id",
    });

    const url = routeUrl(fetchFunction.mock.calls[0][0].path);
    expect(url.pathname).toBe("/dataset/dataset%20id/sample/sample%2Fid/tags");
    expect(url.searchParams.getAll("anchors")).toEqual([
      "lidar_top",
      "camera_front",
    ]);
    expect(url.searchParams.get("end")).toBe("20");
    expect(url.searchParams.get("index_type")).toBe("2");
    expect(url.searchParams.get("start")).toBe("10");
    expect(url.searchParams.getAll("tags")).toEqual(["review", "interesting"]);
  });

  it("converts create bodies and response tags between app and route shapes", async () => {
    const fetchFunction = createFetch({
      tags: [createTagDto()],
    });
    const client = createTagsClient({
      fetchFunction: fetchFunction as never,
    });

    const tags = await client.createSampleTags({
      datasetId: "dataset-id",
      sampleId: "sample-id",
      tags: [createTagInput()],
    });

    expect(fetchFunction.mock.calls[0][0].body).toEqual({
      tags: [
        {
          anchor: "lidar_top",
          created_by: "sashank",
          end: 10,
          index_type: 2,
          last_modified_by: "kacey",
          start: 5,
          tag: "review",
        },
      ],
    });
    expect(JSON.stringify(fetchFunction.mock.calls[0][0].body)).not.toContain(
      "sample_id"
    );
    expect(tags[0]).toEqual({
      anchor: "lidar_top",
      createdAt: "2026-05-26T12:00:00Z",
      createdBy: "sashank",
      end: 10,
      id: "tag-id",
      indexType: 2,
      lastModifiedAt: "2026-05-26T12:01:00Z",
      lastModifiedBy: "kacey",
      sampleId: "sample-id",
      start: 5,
      tag: "review",
    });
  });

  it("converts update bodies without route-owned identity fields", async () => {
    const fetchFunction = createFetch({
      tag: createTagDto({ end: 15, tag: "moved" }),
    });
    const client = createTagsClient({
      fetchFunction: fetchFunction as never,
    });

    const tag = await client.updateSampleTag({
      datasetId: "dataset-id",
      sampleId: "sample-id",
      tagId: "tag-id",
      update: {
        end: 15,
        lastModifiedBy: "sashank",
        tag: "moved",
      },
    });

    expect(fetchFunction.mock.calls[0][0].body).toEqual({
      end: 15,
      last_modified_by: "sashank",
      tag: "moved",
    });
    expect(JSON.stringify(fetchFunction.mock.calls[0][0].body)).not.toContain(
      "sample_id"
    );
    expect(tag.tag).toBe("moved");
  });

  it("supports deleting explicit temporal tag ids", async () => {
    const fetchFunction = createFetch({ deleted: 2 });
    const client = createTagsClient({
      fetchFunction: fetchFunction as never,
    });

    await expect(
      client.deleteSampleTags({
        datasetId: "dataset-id",
        sampleId: "sample-id",
        ids: ["tag-id"],
      })
    ).resolves.toBe(2);

    expect(fetchFunction.mock.calls[0][0].body).toEqual({
      ids: ["tag-id"],
    });
  });

  it("supports clearing all sample tags with an optional filter", async () => {
    const fetchFunction = createFetch({ deleted: 2 });
    const client = createTagsClient({
      fetchFunction: fetchFunction as never,
    });

    await expect(
      client.clearSampleTags({
        datasetId: "dataset-id",
        filter: {
          anchors: ["lidar_top"],
          end: 20,
          indexType: 2,
          start: 10,
          tags: ["review"],
        },
        sampleId: "sample-id",
      })
    ).resolves.toBe(2);

    expect(fetchFunction.mock.calls[0][0].body).toEqual({
      delete_all: true,
      filter: {
        anchors: ["lidar_top"],
        end: 20,
        index_type: 2,
        start: 10,
        tags: ["review"],
      },
    });
  });
});

function createFetch(response: unknown | ((config: FetchConfig) => unknown)) {
  return vi.fn(async (config: FetchConfig) => ({
    headers: new Headers(),
    response: typeof response === "function" ? response(config) : response,
  }));
}

function responseForRoute(config: FetchConfig) {
  if (config.method === "DELETE") {
    return { deleted: 1 };
  }

  if (config.path.endsWith("/counts")) {
    return { counts: { review: 1 } };
  }

  if (config.method === "PATCH") {
    return { tag: createTagDto() };
  }

  return { tags: [createTagDto()] };
}

function routeKey(config: FetchConfig) {
  const url = routeUrl(config.path);

  return `${config.method} ${url.pathname}`;
}

function routeUrl(path: string) {
  return new URL(path, "http://fiftyone.test");
}

function createTagInput() {
  return {
    anchor: "lidar_top",
    createdBy: "sashank",
    end: 10,
    indexType: 2,
    lastModifiedBy: "kacey",
    start: 5,
    tag: "review",
  };
}

function createTagDto(
  overrides: Partial<ReturnType<typeof createTagDtoBase>> = {}
) {
  return {
    ...createTagDtoBase(),
    ...overrides,
  };
}

function createTagDtoBase() {
  return {
    anchor: "lidar_top",
    created_at: "2026-05-26T12:00:00Z",
    created_by: "sashank",
    end: 10,
    id: "tag-id",
    index_type: 2,
    last_modified_at: "2026-05-26T12:01:00Z",
    last_modified_by: "kacey",
    sample_id: "sample-id",
    start: 5,
    tag: "review",
  };
}
