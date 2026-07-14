import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McapRawTopicInfo } from "./mcap-raw-message-context";
import McapRawMessageTileSettings from "./McapRawMessageTileSettings";

const mockState = vi.hoisted(() => ({
  ensureTopics: vi.fn(),
  selectedTopic: null as string | null,
  setTopic: vi.fn(),
  topics: {
    status: "ready" as "error" | "idle" | "loading" | "ready",
    topics: [] as readonly McapRawTopicInfo[],
  },
}));

vi.mock("./mcap-raw-message-context", () => ({
  useMcapRawMessageContext: () => ({
    ensureTopics: mockState.ensureTopics,
    topics: mockState.topics,
  }),
}));

vi.mock("./mcap-raw-tile-state", () => ({
  useMcapRawTileTopic: () => mockState.selectedTopic,
  useSetMcapRawTileTopic: () => mockState.setTopic,
}));

afterEach(() => {
  cleanup();
  mockState.selectedTopic = null;
  mockState.setTopic.mockReset();
  mockState.topics = { status: "ready", topics: [] };
});

function topicInfo(topic: string, encoding = "cdr"): McapRawTopicInfo {
  return {
    messageCount: 3,
    messageEncoding: encoding,
    schemaName: `schema${topic}`,
    topic,
  } as McapRawTopicInfo;
}

describe("McapRawMessageTileSettings", () => {
  it("renders topics as a single-select radio group", () => {
    mockState.topics = {
      status: "ready",
      topics: [topicInfo("/gps"), topicInfo("/imu")],
    };
    mockState.selectedTopic = "/imu";

    render(<McapRawMessageTileSettings />);

    expect(
      screen.getByRole("radiogroup", { name: "Inspected topic" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(
      (screen.getByRole("radio", { name: "/imu" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole("radio", { name: "/gps" }) as HTMLInputElement).checked,
    ).toBe(false);

    // Selecting another topic replaces the selection — one inspected topic
    // at a time, and the rows never reach an everything-unchecked state.
    fireEvent.click(screen.getByRole("radio", { name: "/gps" }));
    expect(mockState.setTopic).toHaveBeenCalledWith("/gps");
  });

  it("filters topics by name and schema", () => {
    mockState.topics = {
      status: "ready",
      topics: [topicInfo("/gps"), topicInfo("/imu")],
    };

    render(<McapRawMessageTileSettings />);
    fireEvent.change(screen.getByPlaceholderText("Filter topics"), {
      target: { value: "schema/gps" },
    });

    expect(screen.getByRole("radio", { name: "/gps" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "/imu" })).toBeNull();
  });
});
