import { create, toBinary } from "@bufbuild/protobuf";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackPlanSchema, SceneInventorySchema } from "../schemas/v1";
import {
  createMultimodalClient,
  createMultimodalResourcesClient,
  defaultMultimodalClient,
  type ByteRangeReadRequest,
  type ByteResourceClient,
  type MultimodalQueryClient,
} from "./index";

type FetchFunction = <Body, Result>(
  method: string,
  path: string,
  body?: Body,
  result?: "arrayBuffer",
  retries?: number,
  retryCodes?: number[],
  errorHandler?: (response: Response) => void | Promise<void>,
  headers?: Record<string, string>
) => Promise<Result>;

const fetchHarness = vi.hoisted(() => ({
  activeFetch: undefined as FetchFunction | undefined,
  getFetchFunctionOptions: [] as readonly unknown[],
}));

vi.mock("@fiftyone/utilities", () => ({
  getFetchFunction: (options?: unknown) => {
    fetchHarness.getFetchFunctionOptions = [
      ...fetchHarness.getFetchFunctionOptions,
      options,
    ];

    if (!fetchHarness.activeFetch) {
      throw new Error("No active fetch mock");
    }

    return fetchHarness.activeFetch;
  },
  getFetchFunctionExtended: () => {
    throw new Error("No active extended fetch mock");
  },
}));

interface FetchCall {
  readonly body: unknown;
  readonly headers: Record<string, string> | undefined;
  readonly method: string;
  readonly path: string;
  readonly result: "arrayBuffer" | undefined;
}

describe("multimodal client", () => {
  beforeEach(() => {
    fetchHarness.activeFetch = undefined;
    fetchHarness.getFetchFunctionOptions = [];
  });

  it("fetches and decodes typed query artifacts", async () => {
    const scene = create(SceneInventorySchema, {
      inventoryId: "inventory:1",
      sceneId: "scene-1",
      sourceFormat: "source-format",
      inventoryVersion: "v1",
    });
    const plan = create(PlaybackPlanSchema, {
      planId: "plan-1",
      sceneId: "scene-1",
      sourceInventoryId: "inventory:1",
    });

    const { calls, fetch } = createFetchMock({
      "/dataset/dataset-1/sample/sample-1/multimodal/scene-inventory": toBinary(
        SceneInventorySchema,
        scene
      ).buffer,
      "/multimodal/playback-plan/inventory%3A1": toBinary(
        PlaybackPlanSchema,
        plan
      ).buffer,
    });
    fetchHarness.activeFetch = fetch;

    const decodedScene =
      await defaultMultimodalClient.queries.getSceneInventory({
        datasetId: "dataset-1",
        sampleId: "sample-1",
      });
    const decodedPlan = await defaultMultimodalClient.queries.getPlaybackPlan({
      inventoryId: "inventory:1",
    });

    expect(decodedScene.inventoryId).toBe("inventory:1");
    expect(decodedPlan.sourceInventoryId).toBe("inventory:1");
    expect(calls.map((call) => call.result)).toEqual([
      "arrayBuffer",
      "arrayBuffer",
    ]);
    expect(calls.map((call) => call.body)).toEqual([undefined, undefined]);
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET"]);
    expect(calls.map((call) => call.path)).toEqual([
      "/dataset/dataset-1/sample/sample-1/multimodal/scene-inventory",
      "/multimodal/playback-plan/inventory%3A1",
    ]);
  });

  it("constructs clients with injected query and resource surfaces", async () => {
    const queries: MultimodalQueryClient = {
      getPlaybackPlan: vi.fn(async () =>
        create(PlaybackPlanSchema, {
          planId: "plan:custom",
          sourceInventoryId: "inventory:custom",
        })
      ),
      getSceneInventory: vi.fn(async () =>
        create(SceneInventorySchema, {
          inventoryId: "inventory:custom",
          sourceFormat: "container-format",
        })
      ),
    };
    const bytes: ByteResourceClient = {
      readBytes: vi.fn(async (request) => ({
        bytes: new Uint8Array([1, 2, 3]),
        range: request.range,
        source: request.source,
      })),
    };
    const resources = createMultimodalResourcesClient({ bytes });
    const client = createMultimodalClient({ queries, resources });
    const request = createByteRangeReadRequest();

    await expect(
      client.queries.getPlaybackPlan({ inventoryId: "i" })
    ).resolves.toMatchObject({ planId: "plan:custom" });
    await expect(client.resources.bytes.readBytes(request)).resolves.toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      range: request.range,
      source: request.source,
    });
    expect(client.resources).toBe(resources);
  });
});

function createFetchMock(
  responses: Readonly<Record<string, ArrayBufferLike>>
): {
  calls: FetchCall[];
  fetch: FetchFunction;
} {
  const calls: FetchCall[] = [];
  const fetch: FetchFunction = async <Body, Result>(
    method: string,
    path: string,
    body?: Body,
    result?: "arrayBuffer",
    _retries?: number,
    _retryCodes?: number[],
    _errorHandler?: (response: Response) => void | Promise<void>,
    headers?: Record<string, string>
  ): Promise<Result> => {
    calls.push({ body, headers, method, path, result });

    const response = responses[path];
    if (!response) {
      throw new Error(`No mock response for ${path}`);
    }

    return response as Result;
  };

  return { calls, fetch };
}

function createByteRangeReadRequest(
  overrides: Partial<ByteRangeReadRequest> = {}
): ByteRangeReadRequest {
  return {
    ...(overrides.cachePolicy ? { cachePolicy: overrides.cachePolicy } : {}),
    range: overrides.range ?? { length: 16n, offset: 4n },
    source: overrides.source ?? {
      sizeBytes: "128",
      sourceId: "source:1",
      url: "bytes://source/default",
    },
  };
}
