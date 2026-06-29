import { PlaybackProvider, usePlaybackStore } from "@fiftyone/playback";
import { cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { McapTileEmptyState } from "./McapTileStreamState";
import {
  setMcapTopicStartTimeSec,
  setMcapTopicStatus,
} from "./mcap-stream-status-state";

const TOPIC = "/camera";

afterEach(() => {
  cleanup();
});

describe("McapTileEmptyState", () => {
  it("shows a deterministic empty-source message for empty topics", () => {
    render(<McapTileEmptyState topics={[""]} />);

    expect(screen.getByTestId("mcap-tile-empty-state").textContent).toBe(
      "No source available",
    );
  });

  it("rounds tiny positive gap starts up to the displayed centisecond", async () => {
    render(
      <PlaybackProvider>
        <SeedGap startSec={0.001} />
      </PlaybackProvider>,
    );

    expect(await screen.findByText("No data until 0:00.01")).toBeTruthy();
  });
});

function SeedGap({ startSec }: { readonly startSec: number }) {
  const store = usePlaybackStore();

  useEffect(() => {
    setMcapTopicStatus(store, TOPIC, "gap");
    setMcapTopicStartTimeSec(store, TOPIC, startSec);
  }, [startSec, store]);

  return <McapTileEmptyState topics={[TOPIC]} />;
}
