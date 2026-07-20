import { describe, expect, it } from "vitest";

import { SCENE_SOURCE_METADATA, SCENE_SOURCE_TYPE } from "../ir";
import type { StreamInventory } from "../schemas/v1";
import { sceneSourcesFromStreamInventory } from "./stream-inventory";

describe("sceneSourcesFromStreamInventory", () => {
  it("keeps camera suffixes out of labels without collapsing sibling streams", () => {
    const sources = sceneSourcesFromStreamInventory([
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
): StreamInventory {
  return {
    $typeName: "fiftyone.multimodal.schemas.v1.StreamInventory",
    displayName: sourceName,
    metadata: {
      [SCENE_SOURCE_METADATA.SOURCE_NAME]: sourceName,
      [SCENE_SOURCE_METADATA.TYPE]: type,
    },
    recordCount: "1",
    streamId,
  };
}
