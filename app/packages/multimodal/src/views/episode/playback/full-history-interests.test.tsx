import { TileIdScope, TilingProvider } from "@fiftyone/tiling";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  FullHistoryInterestsProvider,
  type FullHistoryFeature,
  useFullHistoryStreams,
  usePublishFullHistoryStreams,
} from "./full-history-interests";

const Publisher: React.FC<{
  readonly feature: FullHistoryFeature;
  readonly streams: readonly string[];
  readonly tileId: string;
}> = ({ feature, streams, tileId }) => (
  <TileIdScope tileId={tileId}>
    <PublisherHook feature={feature} streams={streams} />
  </TileIdScope>
);

const PublisherHook: React.FC<{
  readonly feature: FullHistoryFeature;
  readonly streams: readonly string[];
}> = ({ feature, streams }) => {
  usePublishFullHistoryStreams(feature, streams);
  return null;
};

const Probe: React.FC<{ readonly feature: FullHistoryFeature }> = ({
  feature,
}) => (
  <span data-testid={feature}>
    {JSON.stringify(useFullHistoryStreams(feature))}
  </span>
);

describe("episode full-history interests", () => {
  afterEach(() => cleanup());

  it("unions selections by feature without conflating their streams", () => {
    render(
      <FullHistoryInterestsProvider>
        <TilingProvider>
          <Publisher
            feature="location"
            streams={["/gps-b", "/gps-a", "/gps-a"]}
            tileId="map"
          />
          <Publisher feature="pose" streams={["/gps-a"]} tileId="scene" />
          <Probe feature="location" />
          <Probe feature="pose" />
          <Probe feature="scene-update" />
        </TilingProvider>
      </FullHistoryInterestsProvider>,
    );

    expect(screen.getByTestId("location").textContent).toBe(
      '["/gps-a","/gps-b"]',
    );
    expect(screen.getByTestId("pose").textContent).toBe('["/gps-a"]');
    expect(screen.getByTestId("scene-update").textContent).toBe("[]");
  });

  it("retains a shared stream until its final tile releases it", () => {
    const renderTree = (mapStreams: readonly string[]) => (
      <FullHistoryInterestsProvider>
        <TilingProvider>
          <Publisher feature="location" streams={mapStreams} tileId="map-a" />
          <Publisher feature="location" streams={["/shared"]} tileId="map-b" />
          <Probe feature="location" />
        </TilingProvider>
      </FullHistoryInterestsProvider>
    );
    const view = render(renderTree(["/shared", "/only-a"]));

    expect(screen.getByTestId("location").textContent).toBe(
      '["/only-a","/shared"]',
    );

    view.rerender(renderTree([]));
    expect(screen.getByTestId("location").textContent).toBe('["/shared"]');
  });

  it("removes a tile's interests when it unmounts", () => {
    const view = render(
      <FullHistoryInterestsProvider>
        <TilingProvider>
          <Publisher
            feature="scene-update"
            streams={["/markers"]}
            tileId="scene"
          />
          <Probe feature="scene-update" />
        </TilingProvider>
      </FullHistoryInterestsProvider>,
    );
    expect(screen.getByTestId("scene-update").textContent).toBe('["/markers"]');

    view.rerender(
      <FullHistoryInterestsProvider>
        <TilingProvider>
          <Probe feature="scene-update" />
        </TilingProvider>
      </FullHistoryInterestsProvider>,
    );
    expect(screen.getByTestId("scene-update").textContent).toBe("[]");
  });
});
