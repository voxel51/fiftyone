import { TileIdScope, TilingProvider } from "@fiftyone/tiling";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SCENE_SOURCE_TYPE, STREAM_METADATA, type SceneSource } from "../../ir";
import {
  AnnotationStreamsProvider,
  useSelectedAnnotationStreams,
  usePublishAnnotationStreams,
} from "./selected-annotation-streams";

const Publisher: React.FC<{
  readonly tileId: string;
  readonly streams: readonly string[];
  readonly sources?: readonly SceneSource[];
}> = ({ tileId, streams, sources = [] }) => (
  <TileIdScope tileId={tileId}>
    <PublisherHook streams={streams} sources={sources} />
  </TileIdScope>
);

const PublisherHook: React.FC<{
  readonly streams: readonly string[];
  readonly sources: readonly SceneSource[];
}> = ({ streams, sources }) => {
  publisherRenders += 1;
  usePublishAnnotationStreams(streams, sources);
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

  it("excludes geometry-only outputs while retaining unscanned annotation sources", () => {
    const streams = ["/labels", "derived/driving/ego_motion"];
    const sources: SceneSource[] = streams.map((id) => ({
      id,
      label: id,
      sourceName: id,
      type: SCENE_SOURCE_TYPE.SCENE_ANNOTATION,
    }));
    const view = (geometryOnly: boolean) => (
      <AnnotationStreamsProvider>
        <TilingProvider>
          <Publisher
            tileId="3d"
            streams={streams}
            sources={[
              sources[0],
              {
                ...sources[1],
                metadata: {
                  [STREAM_METADATA.LABEL_TRACKS]: String(!geometryOnly),
                },
              },
            ]}
          />
          <Probe />
        </TilingProvider>
      </AnnotationStreamsProvider>
    );
    const { rerender } = render(view(true));
    expect(screen.getByTestId("streams").textContent).toBe('["/labels"]');

    rerender(view(false));
    expect(screen.getByTestId("streams").textContent).toBe(
      JSON.stringify(streams),
    );

    rerender(view(true));
    expect(screen.getByTestId("streams").textContent).toBe('["/labels"]');
  });
});
