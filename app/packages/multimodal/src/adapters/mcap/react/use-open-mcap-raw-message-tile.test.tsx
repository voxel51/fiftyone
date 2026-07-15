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
  mcapRawTileTopicAtom,
  type McapRawTileTopics,
} from "./mcap-raw-tile-state";
import { MCAP_TILE_TYPE } from "./mcap-tile-types";
import { useOpenMcapRawMessageTile } from "./use-open-mcap-raw-message-tile";

const Probe: React.FC<{ readonly seedTopics?: McapRawTileTopics }> = ({
  seedTopics,
}) => {
  const openRawMessageTile = useOpenMcapRawMessageTile();
  const { focusedTileId, tiles } = useTiling();
  const topicsByTile = useAtomValue(mcapRawTileTopicAtom);

  return (
    <>
      {seedTopics ? <SeedTopics topics={seedTopics} /> : null}
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
          topicsByTile,
          types: Object.fromEntries(
            Object.entries(tiles).map(([id, tile]) => [id, tile.type]),
          ),
        })}
      </span>
    </>
  );
};

const SeedTopics: React.FC<{ readonly topics: McapRawTileTopics }> = ({
  topics,
}) => {
  const setTopics = useSetAtom(mcapRawTileTopicAtom);
  useEffect(() => {
    setTopics(topics);
  }, [setTopics, topics]);
  return null;
};

afterEach(() => {
  cleanup();
});

describe("useOpenMcapRawMessageTile", () => {
  it("focuses an already-open raw tile for the topic", async () => {
    renderProbe({
      initialTiles: {
        "raw-1": tile(MCAP_TILE_TYPE.RAW),
        "raw-2": tile(MCAP_TILE_TYPE.RAW),
      },
      seedTopics: { "raw-2": "/imu" },
    });
    await waitFor(() =>
      expect(probeState().topicsByTile).toMatchObject({ "raw-2": "/imu" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "open imu" }));

    expect(probeState()).toMatchObject({
      focusedTileId: "raw-2",
      topicsByTile: { "raw-2": "/imu" },
    });
  });

  it("reuses an empty raw tile", () => {
    renderProbe({
      initialTiles: {
        "raw-1": tile(MCAP_TILE_TYPE.RAW),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "open imu" }));

    expect(probeState()).toMatchObject({
      focusedTileId: "raw-1",
      titles: { "raw-1": "/imu" },
      topicsByTile: { "raw-1": "/imu" },
    });
  });

  it("skips occupied raw tiles and reuses the first empty one", async () => {
    renderProbe({
      initialTiles: {
        "raw-1": tile(MCAP_TILE_TYPE.RAW),
        "raw-2": tile(MCAP_TILE_TYPE.RAW),
      },
      seedTopics: { "raw-1": "/gps" },
    });
    await waitFor(() =>
      expect(probeState().topicsByTile).toMatchObject({ "raw-1": "/gps" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "open imu" }));

    expect(probeState()).toMatchObject({
      focusedTileId: "raw-2",
      titles: { "raw-2": "/imu" },
      topicsByTile: { "raw-1": "/gps", "raw-2": "/imu" },
    });
  });

  it("creates a raw tile when no raw tile is available", () => {
    renderProbe();

    fireEvent.click(screen.getByRole("button", { name: "open imu" }));

    expect(probeState()).toMatchObject({
      focusedTileId: "raw-1",
      titles: { "raw-1": "/imu" },
      topicsByTile: { "raw-1": "/imu" },
      types: { "raw-1": MCAP_TILE_TYPE.RAW },
    });
  });

  it("reuses a freshly created raw tile across same-tick calls", () => {
    renderProbe();

    fireEvent.click(screen.getByRole("button", { name: "open imu twice" }));

    expect(probeState()).toMatchObject({
      focusedTileId: "raw-1",
      topicsByTile: { "raw-1": "/imu" },
      types: { "raw-1": MCAP_TILE_TYPE.RAW },
    });
  });
});

function renderProbe({
  initialTiles,
  seedTopics,
}: {
  readonly initialTiles?: Record<string, TilingTile>;
  readonly seedTopics?: McapRawTileTopics;
} = {}) {
  return render(
    <TilingProvider initialTiles={initialTiles}>
      <Probe seedTopics={seedTopics} />
    </TilingProvider>,
  );
}

function probeState(): {
  readonly focusedTileId: string | null;
  readonly titles: Record<string, string>;
  readonly topicsByTile: McapRawTileTopics;
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
