import { TrackProvider, useTrackPinning } from "@fiftyone/playback";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STREAM_METADATA,
  type StreamDescriptor,
} from "../../../../ir/manifest";
import StreamsSettings from "./StreamsSettings";

const harness = vi.hoisted(() => ({
  addFieldToPlot: vi.fn<(stream: string, field: string) => void>(),
}));
vi.mock("../../../../scene-inventory/react", () => ({
  useSceneInventory: () => [],
}));
vi.mock("../../tiles/use-open-tile", () => ({ useOpenTile: () => vi.fn() }));
vi.mock("../../tiles/use-open-image-tile", () => ({
  useOpenImageTile: () => vi.fn(),
}));
vi.mock("../../tiles/use-open-raw-message-tile", () => ({
  useOpenRawMessageTile: () => vi.fn(),
}));
vi.mock("../../commands/use-add-field-to-plot", () => ({
  useAddFieldToPlot: () => harness.addFieldToPlot,
}));

const timeRange = { startNs: 0n, endNs: 60_000_000_000n };
const sensor = (
  name: string,
  kind: StreamDescriptor["kind"],
  type: string,
): StreamDescriptor => ({
  id: `sensors/${name}`,
  kind,
  sourceName: `Driving / ${name}`,
  payload: { encoding: "json", schema: `example.${type}` },
  timeRange,
  numericFieldPath: type === "signal" ? "speed_mps" : undefined,
  timelineTrackId: type === "events" ? `track:${name}` : undefined,
  metadata: {
    [STREAM_METADATA.INSPECTABLE]: "false",
  },
});
const streams = [
  sensor("speed", "scalar", "signal"),
  sensor("hard_braking", "events", "events"),
];
const terminology = { plural: "topics", singular: "topic" };

function PinnedProbe() {
  const { pinnedIds } = useTrackPinning();
  return <span data-testid="pinned">{[...pinnedIds].join(",")}</span>;
}

afterEach(() => {
  cleanup();
  harness.addFieldToPlot.mockClear();
});

describe("StreamsSettings presentation targets", () => {
  it("lists declared outputs as supported with Plot and Tracks actions", () => {
    render(
      <TrackProvider>
        <PinnedProbe />
        <StreamsSettings streams={streams} terminology={terminology} />
      </TrackProvider>,
    );
    expect(screen.queryByText("No decoder")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Plot Driving / speed" }),
    );
    expect(harness.addFieldToPlot).toHaveBeenCalledWith(
      "sensors/speed",
      "speed_mps",
    );
    expect(
      screen.queryByRole("button", { name: "Plot Driving / hard_braking" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Tracks Driving / hard_braking" }),
    );
    expect(screen.getByTestId("pinned").textContent).toBe("track:hard_braking");
  });

  it("offers no Tracks action without a track timeline around it", () => {
    render(<StreamsSettings streams={streams} terminology={terminology} />);
    expect(
      screen.getByRole("button", { name: "Plot Driving / speed" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Tracks Driving / hard_braking" }),
    ).toBeNull();
  });
});
