import { describe, expect, it } from "vitest";
import type { ByteSourceDescriptor } from "../../query/bytes";
import type { StreamInventory } from "../../schemas/v1";
import type { McapGridPreviewFrame } from "./grid-preview";
import {
  getMcapSourceBootstrap,
  peekMcapSourceBootstrap,
  publishMcapSourceBootstrap,
  resetMcapSourceBootstrapCacheForTests,
} from "./source-bootstrap-cache";

describe("MCAP source bootstrap cache", () => {
  it("merges inventory and poster facts for the same source", () => {
    resetMcapSourceBootstrapCacheForTests();
    const source = createSource("sample");
    const topics = [createTopic("/camera")];
    const poster = createPoster([1, 2, 3]);

    publishMcapSourceBootstrap(source, { topics });
    publishMcapSourceBootstrap(source, {
      poster,
      posterTopic: "/camera",
    });

    expect(getMcapSourceBootstrap(source)).toEqual({
      poster,
      posterTopic: "/camera",
      topics,
    });
  });

  it("evicts old entries under the source-count bound", () => {
    resetMcapSourceBootstrapCacheForTests();
    const first = createSource("source-0");
    publishMcapSourceBootstrap(first, { topics: [createTopic("first")] });

    for (let index = 1; index <= 32; index++) {
      publishMcapSourceBootstrap(createSource(`source-${index}`), {
        topics: [createTopic(`topic-${index}`)],
      });
    }

    expect(getMcapSourceBootstrap(first)).toBeNull();
    expect(getMcapSourceBootstrap(createSource("source-32"))?.topics).toEqual([
      createTopic("topic-32"),
    ]);
  });

  it("clears a stale poster topic when replacing the poster without one", () => {
    resetMcapSourceBootstrapCacheForTests();
    const source = createSource("poster-replacement");
    const firstPoster = createPoster([1]);
    const replacementPoster = createPoster([2]);

    publishMcapSourceBootstrap(source, {
      poster: firstPoster,
      posterTopic: "/camera/first",
    });
    publishMcapSourceBootstrap(source, { poster: replacementPoster });

    expect(peekMcapSourceBootstrap(source)).toEqual({
      poster: replacementPoster,
    });
  });
});

function createSource(sourceId: string): ByteSourceDescriptor {
  return { sourceId, url: `memory://${sourceId}.mcap` };
}

function createTopic(streamId: string): StreamInventory {
  return {
    $typeName: "fiftyone.multimodal.schemas.v1.StreamInventory",
    metadata: {},
    streamId,
  };
}

function createPoster(bytes: number[]): McapGridPreviewFrame {
  return {
    image: {
      bytes: new Uint8Array(bytes),
      kind: "encoded-image",
      mimeType: "image/jpeg",
    },
    kind: "image",
  };
}
