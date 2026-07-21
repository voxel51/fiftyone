import { TileIdScope, TilingProvider } from "@fiftyone/tiling";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  McapAnnotationTopicsProvider,
  useMcapSelectedAnnotationTopics,
  usePublishMcapAnnotationTopics,
} from "./selected-annotation-topics";

const Publisher: React.FC<{
  readonly tileId: string;
  readonly topics: readonly string[];
}> = ({ tileId, topics }) => (
  <TileIdScope tileId={tileId}>
    <PublisherHook topics={topics} />
  </TileIdScope>
);

const PublisherHook: React.FC<{ readonly topics: readonly string[] }> = ({
  topics,
}) => {
  publisherRenders += 1;
  usePublishMcapAnnotationTopics(topics);
  return null;
};

const Probe = () => (
  <span data-testid="topics">
    {JSON.stringify(useMcapSelectedAnnotationTopics())}
  </span>
);

let publisherRenders = 0;

describe("MCAP selected annotation topics", () => {
  beforeEach(() => {
    publisherRenders = 0;
  });
  afterEach(() => cleanup());

  it("publishes a sorted viewer-local union and cleans up by tile", () => {
    const view = render(
      <McapAnnotationTopicsProvider>
        <TilingProvider>
          <Publisher tileId="image" topics={["/b", "/a", "/a"]} />
          <Publisher tileId="3d" topics={["/b", "/c"]} />
          <Probe />
        </TilingProvider>
      </McapAnnotationTopicsProvider>,
    );
    expect(screen.getByTestId("topics").textContent).toBe('["/a","/b","/c"]');
    expect(publisherRenders).toBe(2);

    view.rerender(
      <McapAnnotationTopicsProvider>
        <TilingProvider>
          <Publisher tileId="image" topics={["/a"]} />
          <Probe />
        </TilingProvider>
      </McapAnnotationTopicsProvider>,
    );
    expect(screen.getByTestId("topics").textContent).toBe('["/a"]');
  });

  it("does not retain empty selections", () => {
    render(
      <McapAnnotationTopicsProvider>
        <TilingProvider>
          <Publisher tileId="image" topics={[]} />
          <Probe />
        </TilingProvider>
      </McapAnnotationTopicsProvider>,
    );
    expect(screen.getByTestId("topics").textContent).toBe("[]");
  });
});
