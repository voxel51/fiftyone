import { TileIdScope, TilingProvider } from "@fiftyone/tiling";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AnnotationStreamsProvider,
  useSelectedAnnotationStreams,
  usePublishAnnotationStreams,
} from "./selected-annotation-streams";

const Publisher: React.FC<{
  readonly tileId: string;
  readonly streams: readonly string[];
}> = ({ tileId, streams }) => (
  <TileIdScope tileId={tileId}>
    <PublisherHook streams={streams} />
  </TileIdScope>
);

const PublisherHook: React.FC<{ readonly streams: readonly string[] }> = ({
  streams,
}) => {
  publisherRenders += 1;
  usePublishAnnotationStreams(streams);
  return null;
};

const Probe = () => (
  <span data-testid="streams">
    {JSON.stringify(useSelectedAnnotationStreams())}
  </span>
);

let publisherRenders = 0;

describe("episode selected annotation streams", () => {
  beforeEach(() => {
    publisherRenders = 0;
  });
  afterEach(() => cleanup());

  it("publishes a sorted viewer-local union and cleans up by tile", () => {
    const view = render(
      <AnnotationStreamsProvider>
        <TilingProvider>
          <Publisher tileId="image" streams={["/b", "/a", "/a"]} />
          <Publisher tileId="3d" streams={["/b", "/c"]} />
          <Probe />
        </TilingProvider>
      </AnnotationStreamsProvider>,
    );
    expect(screen.getByTestId("streams").textContent).toBe('["/a","/b","/c"]');
    expect(publisherRenders).toBe(2);

    view.rerender(
      <AnnotationStreamsProvider>
        <TilingProvider>
          <Publisher tileId="image" streams={["/a"]} />
          <Probe />
        </TilingProvider>
      </AnnotationStreamsProvider>,
    );
    expect(screen.getByTestId("streams").textContent).toBe('["/a"]');
  });

  it("does not retain empty selections", () => {
    render(
      <AnnotationStreamsProvider>
        <TilingProvider>
          <Publisher tileId="image" streams={[]} />
          <Probe />
        </TilingProvider>
      </AnnotationStreamsProvider>,
    );
    expect(screen.getByTestId("streams").textContent).toBe("[]");
  });
});
