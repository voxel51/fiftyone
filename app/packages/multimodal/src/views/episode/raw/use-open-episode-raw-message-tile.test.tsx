import { TilingProvider, useTiling, type TilingTile } from "@fiftyone/tiling";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useAtomValue, useSetAtom } from "jotai";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  episodeRawTileStreamAtom,
  type EpisodeRawTileStreams,
} from "./episode-raw-tile-state";
import { EPISODE_TILE_TYPE } from "../tiles/episode-tile-types";
import { useOpenEpisodeRawMessageTile } from "./use-open-episode-raw-message-tile";

const Probe: React.FC<{ readonly seedStreams?: EpisodeRawTileStreams }> = ({
  seedStreams,
}) => {
  const openRawMessageTile = useOpenEpisodeRawMessageTile();
  const { focusedTileId, tiles } = useTiling();
  const streamsByTile = useAtomValue(episodeRawTileStreamAtom);

  return (
    <>
      {seedStreams ? <SeedStreams streams={seedStreams} /> : null}
      <button onClick={() => openRawMessageTile("/imu")} type="button">
        open imu
      </button>
      <button
        onClick={() => {
          openRawMessageTile("/imu");
          openRawMessageTile("/imu");
        }}
        type="button"
      >
        open imu twice
      </button>
      <span data-testid="probe">
        {JSON.stringify({
          focusedTileId,
          titles: Object.fromEntries(
            Object.entries(tiles).map(([id, tile]) => [id, tile.title]),
          ),
          streamsByTile,
          types: Object.fromEntries(
            Object.entries(tiles).map(([id, tile]) => [id, tile.type]),
          ),
        })}
      </span>
    </>
  );
};

const SeedStreams: React.FC<{ readonly streams: EpisodeRawTileStreams }> = ({
  streams,
}) => {
  const setStreams = useSetAtom(episodeRawTileStreamAtom);

  // This effect seeds the raw-stream atom for the hook under test.
  useEffect(() => {
    setStreams(streams);
  }, [setStreams, streams]);
  return null;
};

afterEach(() => {
  cleanup();
});

describe("useOpenEpisodeRawMessageTile", () => {
  it("focuses an already-open raw tile for the stream", async () => {
    renderProbe({
      initialTiles: {
        "raw-1": tile(EPISODE_TILE_TYPE.RAW),
        "raw-2": tile(EPISODE_TILE_TYPE.RAW),
      },
      seedStreams: { "raw-2": "/imu" },
    });
    await waitFor(() =>
      expect(probeState().streamsByTile).toMatchObject({ "raw-2": "/imu" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "open imu" }));

    expect(probeState()).toMatchObject({
      focusedTileId: "raw-2",
      streamsByTile: { "raw-2": "/imu" },
    });
  });

  it("reuses an empty raw tile", () => {
    renderProbe({
      initialTiles: {
        "raw-1": tile(EPISODE_TILE_TYPE.RAW),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "open imu" }));

    expect(probeState()).toMatchObject({
      focusedTileId: "raw-1",
      titles: { "raw-1": "/imu" },
      streamsByTile: { "raw-1": "/imu" },
    });
  });

  it("skips occupied raw tiles and reuses the first empty one", async () => {
    renderProbe({
      initialTiles: {
        "raw-1": tile(EPISODE_TILE_TYPE.RAW),
        "raw-2": tile(EPISODE_TILE_TYPE.RAW),
      },
      seedStreams: { "raw-1": "/gps" },
    });
    await waitFor(() =>
      expect(probeState().streamsByTile).toMatchObject({ "raw-1": "/gps" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "open imu" }));

    expect(probeState()).toMatchObject({
      focusedTileId: "raw-2",
      titles: { "raw-2": "/imu" },
      streamsByTile: { "raw-1": "/gps", "raw-2": "/imu" },
    });
  });

  it("creates a raw tile when no raw tile is available", () => {
    renderProbe();

    fireEvent.click(screen.getByRole("button", { name: "open imu" }));

    expect(probeState()).toMatchObject({
      focusedTileId: "raw-1",
      titles: { "raw-1": "/imu" },
      streamsByTile: { "raw-1": "/imu" },
      types: { "raw-1": EPISODE_TILE_TYPE.RAW },
    });
  });

  it("reuses a freshly created raw tile across same-tick calls", () => {
    renderProbe();

    fireEvent.click(screen.getByRole("button", { name: "open imu twice" }));

    expect(probeState()).toMatchObject({
      focusedTileId: "raw-1",
      streamsByTile: { "raw-1": "/imu" },
      types: { "raw-1": EPISODE_TILE_TYPE.RAW },
    });
  });
});

function renderProbe({
  initialTiles,
  seedStreams,
}: {
  readonly initialTiles?: Record<string, TilingTile>;
  readonly seedStreams?: EpisodeRawTileStreams;
} = {}) {
  return render(
    <TilingProvider initialTiles={initialTiles}>
      <Probe seedStreams={seedStreams} />
    </TilingProvider>,
  );
}

function probeState(): {
  readonly focusedTileId: string | null;
  readonly titles: Record<string, string>;
  readonly streamsByTile: EpisodeRawTileStreams;
  readonly types: Record<string, string>;
} {
  const probe = screen.getByTestId("probe");
  return JSON.parse(probe.textContent ?? "{}");
}

function tile(type: string): TilingTile {
  return {
    render: () => null,
    title: type,
    type,
  };
}
