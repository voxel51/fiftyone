import { setFetchFunction } from "@fiftyone/utilities";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSamples } from "./samples";

const stubFetch = (payload: unknown) => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(payload),
    headers: new Headers(),
  });
  vi.stubGlobal("fetch", mockFetch);
  setFetchFunction("http://localhost");
  return mockFetch;
};

describe("fetchSamples", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts the request body to the dataset's samples endpoint", async () => {
    const rows = [{ id: "1", urls: [], fields: {} }];
    const mockFetch = stubFetch({ samples: rows });

    const result = await fetchSamples({
      datasetId: "data set",
      view: [],
      count: 2,
      dynamicGroup: "scene-a",
      skipMetadata: true,
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/dataset/data%20set/samples");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    // datasetId rides the path, never the body; everything else passes through
    expect(body).not.toHaveProperty("datasetId");
    expect(body).toMatchObject({
      count: 2,
      dynamicGroup: "scene-a",
      skipMetadata: true,
    });
    expect(result).toEqual(rows);
  });

  it("returns an empty list when the response carries no samples", async () => {
    stubFetch({});

    expect(await fetchSamples({ datasetId: "d", view: [], count: 1 })).toEqual(
      [],
    );
  });
});
