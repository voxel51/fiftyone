import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { manifestMaxAgeMs } from "./episode-manifest-transport";
import {
  prefetchEpisodeManifests,
  requestEpisodeManifest,
  resetEpisodeManifestCachesForTests,
} from "./episode-manifests";

const transport = vi.hoisted(() => ({ fetchFunction: vi.fn() }));

vi.mock("@fiftyone/utilities", () => ({
  getFetchFunctionExtended: () => transport.fetchFunction,
}));

const manifest = (assetId: string) => ({
  assets: [
    {
      asset_id: assetId,
      content_id: "object-1",
      media_type: "video/mp4",
      role: "video-stream",
      selector: { kind: "whole-file" },
      url: "https://store.test/video.mp4",
    },
  ],
});

/** A page response covering exactly the ids it was asked for. */
function pageOf(sampleIds: readonly string[]) {
  return {
    response: {
      errors: {},
      manifests: Object.fromEntries(
        sampleIds.map((sampleId) => [sampleId, manifest(sampleId)]),
      ),
    },
  };
}

function requestedIds(call: number): string[] {
  return [...transport.fetchFunction.mock.calls[call][0].body.sample_ids];
}

describe("episode manifest transport", () => {
  beforeEach(() => {
    resetEpisodeManifestCachesForTests();
    transport.fetchFunction.mockReset();
  });

  afterEach(() => {
    resetEpisodeManifestCachesForTests();
  });

  it("collects tiles that mount together into one page request", async () => {
    // Unbatched, a page of tiles issues a request each and they queue behind
    // the browser's connection limit - which is what a user waits on
    transport.fetchFunction.mockImplementation(({ body }) =>
      Promise.resolve(pageOf(body.sample_ids)),
    );

    const results = await Promise.all([
      requestEpisodeManifest("d", "one"),
      requestEpisodeManifest("d", "two"),
      requestEpisodeManifest("d", "three"),
    ]);

    expect(transport.fetchFunction).toHaveBeenCalledTimes(1);
    expect(requestedIds(0).sort()).toEqual(["one", "three", "two"]);
    expect(results.map((entry) => entry.assets[0].asset_id)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(transport.fetchFunction.mock.calls[0][0]).toMatchObject({
      method: "POST",
      path: "/dataset/d/multimodal/manifests",
    });
  });

  it("does not ask again for a manifest it already has", async () => {
    transport.fetchFunction.mockImplementation(({ body }) =>
      Promise.resolve(pageOf(body.sample_ids)),
    );

    await prefetchEpisodeManifests("d", ["one", "two"]);
    await requestEpisodeManifest("d", "one");
    await prefetchEpisodeManifests("d", ["one", "two"]);

    expect(transport.fetchFunction).toHaveBeenCalledTimes(1);
  });

  it("scopes what it remembers to a dataset", async () => {
    transport.fetchFunction.mockImplementation(({ body }) =>
      Promise.resolve(pageOf(body.sample_ids)),
    );

    await requestEpisodeManifest("one-dataset", "s");
    await requestEpisodeManifest("other-dataset", "s");

    expect(transport.fetchFunction).toHaveBeenCalledTimes(2);
    expect(transport.fetchFunction.mock.calls[1][0].path).toBe(
      "/dataset/other-dataset/multimodal/manifests",
    );
  });

  it("reports the server's reason for one sample without failing its page", async () => {
    transport.fetchFunction.mockResolvedValue({
      response: {
        errors: {
          broken: {
            detail: "stale-media-reference: the source changed",
            status: 409,
          },
        },
        manifests: { fine: manifest("fine") },
      },
    });

    const [settled, rejected] = await Promise.allSettled([
      requestEpisodeManifest("d", "fine"),
      requestEpisodeManifest("d", "broken"),
    ]);

    expect(settled.status).toBe("fulfilled");
    expect(rejected).toMatchObject({
      reason: { message: "stale-media-reference: the source changed" },
      status: "rejected",
    });
    expect(transport.fetchFunction).toHaveBeenCalledTimes(1);
  });

  it("does not fan out into one request per sample when a page fails", async () => {
    // The stampede batching exists to prevent, arriving exactly when the
    // browser is already saturated
    transport.fetchFunction.mockRejectedValue(
      Object.assign(new Error("gateway timeout"), { status: 504 }),
    );

    const outcomes = await Promise.allSettled([
      requestEpisodeManifest("d", "one"),
      requestEpisodeManifest("d", "two"),
    ]);

    expect(outcomes.every((entry) => entry.status === "rejected")).toBe(true);
    // Two attempts at the one page, and no per-sample requests after it
    expect(transport.fetchFunction).toHaveBeenCalledTimes(2);
    for (const call of transport.fetchFunction.mock.calls) {
      expect(call[0].path).toBe("/dataset/d/multimodal/manifests");
    }
  });

  it("falls back to one request per sample only where the route is absent", async () => {
    // A deployment without the page route, rather than a page that failed
    transport.fetchFunction.mockImplementation(({ method }) =>
      method === "POST"
        ? Promise.reject(Object.assign(new Error("not found"), { status: 404 }))
        : Promise.resolve({ response: manifest("one") }),
    );

    await expect(requestEpisodeManifest("d", "one")).resolves.toMatchObject({
      assets: [{ asset_id: "one" }],
    });

    const paths = transport.fetchFunction.mock.calls.map(
      (call) => call[0].path,
    );
    expect(paths).toContain("/dataset/d/sample/one/multimodal/manifest");
  });

  it("splits a request larger than the server will accept", async () => {
    transport.fetchFunction.mockImplementation(({ body }) =>
      Promise.resolve(pageOf(body.sample_ids)),
    );
    const sampleIds = Array.from({ length: 600 }, (_, index) => `s${index}`);

    await prefetchEpisodeManifests("d", sampleIds);

    expect(transport.fetchFunction).toHaveBeenCalledTimes(2);
    expect(requestedIds(0)).toHaveLength(512);
    expect(requestedIds(1)).toHaveLength(88);
  });

  it("serves a tile past the first chunk from its own page", async () => {
    // Registering each chunk only as its turn came left a tile in the second
    // chunk with nothing to join, so it asked for itself alone - a request per
    // tile, on exactly the pages large enough to need batching.
    transport.fetchFunction.mockImplementation(({ body }) =>
      Promise.resolve(pageOf(body.sample_ids)),
    );
    const sampleIds = Array.from({ length: 600 }, (_, index) => `s${index}`);

    const [, tile] = await Promise.all([
      prefetchEpisodeManifests("d", sampleIds),
      requestEpisodeManifest("d", "s590"),
    ]);

    expect(tile.assets[0].asset_id).toBe("s590");
    expect(transport.fetchFunction).toHaveBeenCalledTimes(2);
  });

  it("does not re-request a sample a page already has in flight", async () => {
    // The pager prefetches a page while its tiles are mounting and asking for
    // themselves, and both arrive here.
    transport.fetchFunction.mockImplementation(({ body }) =>
      Promise.resolve(pageOf(body.sample_ids)),
    );

    await Promise.all([
      prefetchEpisodeManifests("d", ["one", "two"]),
      prefetchEpisodeManifests("d", ["two", "three"]),
    ]);

    expect(
      transport.fetchFunction.mock.calls.flatMap(
        (call) => call[0].body.sample_ids,
      ),
    ).toEqual(["one", "two", "three"]);
  });
});

describe("manifestMaxAgeMs", () => {
  // A manifest carries the URLs its reader fetches bytes with, so how long it
  // may be held is the server's call - it is what signed them.
  const cases = [
    { expected: 60_000, label: "a bound the server sent", maxAge: 60 },
    {
      expected: 5 * 60 * 1000,
      label: "a bound past the ceiling",
      maxAge: 86_400,
    },
    { expected: 5 * 60 * 1000, label: "no bound at all", maxAge: undefined },
    { expected: 5 * 60 * 1000, label: "a zero bound", maxAge: 0 },
    { expected: 5 * 60 * 1000, label: "a negative bound", maxAge: -1 },
  ];

  for (const { expected, label, maxAge } of cases) {
    it(`holds a manifest for ${label}`, () => {
      expect(
        manifestMaxAgeMs({
          assets: [],
          ...(maxAge === undefined ? {} : { max_age_seconds: maxAge }),
        }),
      ).toBe(expected);
    });
  }
});
