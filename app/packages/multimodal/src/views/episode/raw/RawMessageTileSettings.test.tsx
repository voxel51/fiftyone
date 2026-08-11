import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RawStreamInfo } from "./raw-message-context";
import RawMessageTileSettings from "./RawMessageTileSettings";

const mockState = vi.hoisted(() => ({
  ensureStreams: vi.fn(),
  selectedStream: null as string | null,
  setStream: vi.fn(),
  streams: {
    status: "ready" as "error" | "idle" | "loading" | "ready",
    streams: [] as readonly RawStreamInfo[],
  },
}));

vi.mock("./raw-message-context", () => ({
  useRawMessageContext: () => ({
    ensureStreams: mockState.ensureStreams,
    streams: mockState.streams,
  }),
}));

vi.mock("../tiles/raw-message-binding", () => ({
  useRawTileStream: () => mockState.selectedStream,
  useSetRawTileStream: () => mockState.setStream,
}));

afterEach(() => {
  cleanup();
  mockState.selectedStream = null;
  mockState.setStream.mockReset();
  mockState.streams = { status: "ready", streams: [] };
});

function streamInfo(stream: string, encoding = "cdr"): RawStreamInfo {
  return {
    encoding,
    sampleCount: 3,
    schemaName: `schema${stream}`,
    sourceName: stream,
    streamId: stream,
  };
}

describe("RawMessageTileSettings", () => {
  it("renders streams as a single-select radio group", () => {
    mockState.streams = {
      status: "ready",
      streams: [streamInfo("/gps"), streamInfo("/imu")],
    };
    mockState.selectedStream = "/imu";

    render(<RawMessageTileSettings />);

    expect(
      screen.getByRole("radiogroup", { name: "Inspected stream" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(radioChecked("/imu")).toBe(true);
    expect(radioChecked("/gps")).toBe(false);

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

    render(<RawMessageTileSettings />);
    fireEvent.change(screen.getByPlaceholderText("Filter streams"), {
      target: { value: "schema/gps" },
    });

    expect(screen.getByRole("radio", { name: "/gps" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "/imu" })).toBeNull();
  });
});

function radioChecked(name: string): boolean {
  const radio = screen.getByRole("radio", { name });
  if (!(radio instanceof HTMLInputElement)) {
    throw new Error(`expected ${name} to be a radio input`);
  }
  return radio.checked;
}
