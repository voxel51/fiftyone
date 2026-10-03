/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { mainSample, type mainSampleQuery } from "@fiftyone/relay";
import {
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  RecordSource,
  Store,
  type Variables,
  type VariablesOf,
} from "relay-runtime";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import {
  resolveModalMediaSrcs,
  retainModalSample,
  warmModalSample,
} from "./modalPrefetch";

type Response = mainSampleQuery["response"];

// Fixtures carry only the fields under test, not the full generated union.
const response = (sample: unknown): Response =>
  ({ sample }) as unknown as Response;

describe("resolveModalMediaSrcs", () => {
  const urls = [
    { field: "filepath", url: "https://cdn.test/full.jpg" },
    { field: "thumbnail", url: "https://cdn.test/thumb.jpg" },
  ];

  it("resolves the selected media field, plus urls[0] for the Lighter renderer", () => {
    expect(
      resolveModalMediaSrcs(
        response({ __typename: "ImageSample", urls }),
        "thumbnail",
      ),
    ).toEqual(["https://cdn.test/thumb.jpg", "https://cdn.test/full.jpg"]);
  });

  it("resolves one URL when the selected field is the first one", () => {
    expect(
      resolveModalMediaSrcs(
        response({ __typename: "ImageSample", urls }),
        "filepath",
      ),
    ).toEqual(["https://cdn.test/full.jpg"]);
  });

  it("falls back to filepath when the media field is absent", () => {
    expect(
      resolveModalMediaSrcs(
        response({ __typename: "ImageSample", urls }),
        "missing",
      ),
    ).toEqual(["https://cdn.test/full.jpg"]);
  });

  it("returns nothing when an image sample has no usable url", () => {
    expect(
      resolveModalMediaSrcs(
        response({ __typename: "ImageSample", urls: [] }),
        "x",
      ),
    ).toEqual([]);
    expect(
      resolveModalMediaSrcs(
        response({ __typename: "ImageSample", urls: null }),
        "x",
      ),
    ).toEqual([]);
  });

  it("returns nothing for non-image media", () => {
    for (const __typename of [
      "VideoSample",
      "ThreeDSample",
      "PointCloudSample",
      "UnknownSample",
      "%other",
    ]) {
      expect(
        resolveModalMediaSrcs(response({ __typename, urls }), "thumbnail"),
      ).toEqual([]);
    }
  });

  it("returns nothing for a missing sample", () => {
    expect(resolveModalMediaSrcs(response(null), "thumbnail")).toEqual([]);
  });
});

const variablesFor = (id: string): VariablesOf<mainSampleQuery> => ({
  dataset: "ds",
  view: [],
  filter: { id, group: null },
});

const statusOf = (environment: Environment, id: string) =>
  environment.check(
    createOperationDescriptor(getRequest(mainSample), variablesFor(id)),
  ).status;

// The store schedules its GC on a resolved promise; let it run.
const flushRelayGc = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("warmModalSample", () => {
  // Every src a warmed <img> is pointed at; jsdom never loads them.
  const imageSrcs: string[] = [];
  let typename: string;
  // Media fields beyond filepath, for samples with alternate media.
  let extraUrls: { field: string; url: string }[] = [];

  const sampleDoc = (id: string) => ({
    sample: {
      __typename: typename,
      id,
      aspectRatio: 1,
      frameRate: 30,
      frameNumber: 1,
      sample: { _id: id },
      urls: [
        { field: "filepath", url: `https://cdn.test/${id}.jpg?sig=a` },
        ...extraUrls,
      ],
    },
  });

  let fetchFn: Mock<
    (variables: Variables) => { data: ReturnType<typeof sampleDoc> }
  >;
  let environment: Environment;

  beforeEach(() => {
    imageSrcs.length = 0;
    typename = "ImageSample";
    extraUrls = [];
    vi.stubGlobal(
      "Image",
      class {
        decoding = "auto";
        set src(value: string) {
          imageSrcs.push(value);
        }
      },
    );
    fetchFn = vi.fn((variables: Variables) => ({
      data: sampleDoc(String(variables.filter.id)),
    }));
    environment = new Environment({
      network: Network.create((_request, variables) =>
        Promise.resolve(fetchFn(variables)),
      ),
      // The App's setting: a result is collectable once its last retain
      // goes.
      store: new Store(new RecordSource(), { gcReleaseBufferSize: 0 }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the sample into the store and warms its image", async () => {
    warmModalSample(environment, variablesFor("s1"), "filepath");
    await vi.waitFor(() =>
      expect(imageSrcs).toEqual(["https://cdn.test/s1.jpg?sig=a"]),
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await flushRelayGc();
    // Still retained, so the modal's read of this sample is a store hit.
    expect(statusOf(environment, "s1")).toBe("available");
  });

  it("lets the store collect the sample on release and drops the image", async () => {
    const warmed = warmModalSample(environment, variablesFor("s1"), "filepath");
    await vi.waitFor(() => expect(imageSrcs).toHaveLength(1));

    warmed.release();
    await flushRelayGc();
    expect(statusOf(environment, "s1")).toBe("missing");
    expect(imageSrcs.at(-1)).toBe("");
  });

  it("warms both the selected field and urls[0] when they differ, and drops both", async () => {
    extraUrls = [{ field: "thumbnail", url: "https://cdn.test/s1-thumb.jpg" }];
    const warmed = warmModalSample(
      environment,
      variablesFor("s1"),
      "thumbnail",
    );
    await vi.waitFor(() =>
      expect(imageSrcs).toEqual([
        "https://cdn.test/s1-thumb.jpg",
        "https://cdn.test/s1.jpg?sig=a",
      ]),
    );

    warmed.release();
    expect(imageSrcs.slice(2)).toEqual(["", ""]);
  });

  it("warms the data but no image for non-image samples", async () => {
    typename = "VideoSample";
    warmModalSample(environment, variablesFor("s1"), "filepath");
    await vi.waitFor(() =>
      expect(statusOf(environment, "s1")).toBe("available"),
    );
    expect(imageSrcs).toEqual([]);
  });

  it("shares one fetch between overlapping warms of the same sample", async () => {
    // Two holders warming the same sample: Relay dedupes the in-flight
    // request, and a later warm is served from the store.
    warmModalSample(environment, variablesFor("s1"), "filepath");
    warmModalSample(environment, variablesFor("s1"), "filepath");
    await vi.waitFor(() => expect(imageSrcs).toHaveLength(2));

    warmModalSample(environment, variablesFor("s1"), "filepath");
    await vi.waitFor(() => expect(imageSrcs).toHaveLength(3));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("keeps a sample that another holder still retains", async () => {
    const warmed = warmModalSample(environment, variablesFor("s1"), "filepath");
    await vi.waitFor(() => expect(imageSrcs).toHaveLength(1));
    const held = retainModalSample(environment, variablesFor("s1"));

    warmed.release();
    await flushRelayGc();
    expect(statusOf(environment, "s1")).toBe("available");

    held.dispose();
    await flushRelayGc();
    expect(statusOf(environment, "s1")).toBe("missing");
    // Holding never fetches.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
