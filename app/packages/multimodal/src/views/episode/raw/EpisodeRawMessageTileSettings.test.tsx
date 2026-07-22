import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EpisodeRawStreamInfo } from "./episode-raw-message-context";
import EpisodeRawMessageTileSettings from "./EpisodeRawMessageTileSettings";

const mockState = vi.hoisted(() => ({
  ensureStreams: vi.fn(),
  selectedStream: null as string | null,
  setStream: vi.fn(),
  streams: {
    status: "ready" as "error" | "idle" | "loading" | "ready",
    streams: [] as readonly EpisodeRawStreamInfo[],
  },
}));

vi.mock("./episode-raw-message-context", () => ({
  useEpisodeRawMessageContext: () => ({
    ensureStreams: mockState.ensureStreams,
    streams: mockState.streams,
  }),
}));

vi.mock("../tiles/raw-message-binding", () => ({
  useEpisodeRawTileStream: () => mockState.selectedStream,
  useSetEpisodeRawTileStream: () => mockState.setStream,
}));

afterEach(() => {
  cleanup();
  mockState.selectedStream = null;
  mockState.setStream.mockReset();
  mockState.streams = { status: "ready", streams: [] };
});

function streamInfo(stream: string, encoding = "cdr"): EpisodeRawStreamInfo {
  return {
    encoding,
    sampleCount: 3,
    schemaName: `schema${stream}`,
    sourceName: stream,
    streamId: stream,
  };
}

describe("EpisodeRawMessageTileSettings", () => {
  it("renders streams as a single-select radio group", () => {
    mockState.streams = {
      status: "ready",
      streams: [streamInfo("/gps"), streamInfo("/imu")],
    };
    mockState.selectedStream = "/imu";

    render(<EpisodeRawMessageTileSettings />);

    expect(
      screen.getByRole("radiogroup", { name: "Inspected stream" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(
      (screen.getByRole("radio", { name: "/imu" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole("radio", { name: "/gps" }) as HTMLInputElement).checked,
    ).toBe(false);

    // Selecting another stream replaces the selection — one inspected stream
    // at a time, and the rows never reach an everything-unchecked state.
    fireEvent.click(screen.getByRole("radio", { name: "/gps" }));
    expect(mockState.setStream).toHaveBeenCalledWith("/gps");
  });

  it("filters streams by name and schema", () => {
    mockState.streams = {
      status: "ready",
      streams: [streamInfo("/gps"), streamInfo("/imu")],
    };

    render(<EpisodeRawMessageTileSettings />);
    fireEvent.change(screen.getByPlaceholderText("Filter streams"), {
      target: { value: "schema/gps" },
    });

    expect(screen.getByRole("radio", { name: "/gps" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "/imu" })).toBeNull();
  });
});
