import { describe, expect, it } from "vitest";

import {
  SCENE_SOURCE_METADATA,
  SCENE_SOURCE_TYPE,
  type StreamDescriptor,
} from "../ir";
import { sceneSourcesFromStreamDescriptors } from "./stream-inventory";

describe("sceneSourcesFromStreamDescriptors", () => {
  it("keeps camera suffixes out of labels without collapsing sibling streams", () => {
    const sources = sceneSourcesFromStreamDescriptors([
      stream("7", "/camera/front/image_raw", SCENE_SOURCE_TYPE.IMAGE),
      stream(
        "8",
        "/camera/front/annotations",
        SCENE_SOURCE_TYPE.IMAGE_ANNOTATION,
      ),
    ]);

    expect(sources).toMatchObject([
      { id: "7", label: "camera/front" },
      { id: "8", label: "camera/front/annotations" },
    ]);
  });
});

function stream(
  streamId: string,
  sourceName: string,
  type: string,
): StreamDescriptor {
  return {
    count: 1,
    id: streamId,
    kind: "unknown",
    metadata: {
      [SCENE_SOURCE_METADATA.SOURCE_NAME]: sourceName,
      [SCENE_SOURCE_METADATA.TYPE]: type,
    },
    payload: { encoding: "unknown" },
    sourceName,
    timeRange: { endNs: 1n, startNs: 0n },
  };
}
