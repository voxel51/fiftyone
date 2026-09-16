import type { EpisodeSelection } from "@fiftyone/state/src/selection";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SelectionCard from "./SelectionCard";

vi.mock("@fiftyone/state", () => ({
  getSampleSrc: (path: string) => `media://${path}`,
}));

function segment(start: string, end: string) {
  return {
    episodeId: "episode",
    kind: "segment" as const,
    range: {
      start,
      end,
      timebase: "sequence",
      streams: ["filepath"],
      provenance: [],
    },
  };
}
const full: EpisodeSelection = {
  episodeId: "episode",
  filepath: "/videos/drive.mp4",
  members: [{ episodeId: "episode", kind: "episode" }],
};
const captured: EpisodeSelection = {
  ...full,
  members: [segment("10", "30"), segment("60", "75")],
};
const current: EpisodeSelection = {
  ...full,
  members: [segment("0", "20"), segment("34", "50")],
};

const handlers = {
  open: vi.fn(async () => undefined),
  capture: vi.fn(),
  remove: vi.fn(),
};

function Card(props: {
  group: EpisodeSelection;
  candidate?: EpisodeSelection | null;
}) {
  return (
    <SelectionCard
      group={props.group}
      candidate={props.candidate}
      mediaType="video"
      unit={{ one: "episode", many: "episodes", temporal: true }}
      {...handlers}
    />
  );
}

afterEach(cleanup);

beforeEach(() => {
  handlers.open.mockClear();
  handlers.capture.mockClear();
  handlers.remove.mockClear();
});

describe("SelectionCard", () => {
  it("shows the grouped segment scope and opens the episode from its body", () => {
    render(<Card group={captured} candidate={captured} />);
    expect(screen.getByText("2 segments")).toBeTruthy();
    expect(screen.getByText("10–30, 60–75 frames")).toBeTruthy();
    expect(screen.queryByText("Matches changed")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open drive.mp4" }));
    expect(handlers.open).toHaveBeenCalledWith(captured);
    fireEvent.click(
      screen.getByRole("button", { name: "Remove drive.mp4 from selection" }),
    );
    expect(handlers.remove).toHaveBeenCalledWith("episode");
  });

  it("offers replace and add when current matches differ, naming the destination", async () => {
    render(<Card group={captured} candidate={current} />);
    fireEvent.click(screen.getByText("Matches changed"));
    expect(await screen.findByText("Current matches differ")).toBeTruthy();
    expect(screen.getByText("0–20, 34–50 frames")).toBeTruthy();
    const add = screen.getByRole("button", { name: "Add matching segments" });
    expect(add.hasAttribute("disabled")).toBe(false);
    fireEvent.click(add);
    expect(handlers.capture).toHaveBeenCalledWith(current, "add");
    fireEvent.click(screen.getByText("Matches changed"));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Replace with 2 matching segments",
      }),
    );
    expect(handlers.capture).toHaveBeenCalledWith(current, "replace");
  });

  it("never accumulates onto or from a full episode", async () => {
    const view = render(<Card group={full} candidate={current} />);
    fireEvent.click(screen.getByText("Matches changed"));
    expect(
      (
        await screen.findByRole("button", { name: "Add matching segments" })
      ).hasAttribute("disabled"),
    ).toBe(true);
    view.unmount();
    render(<Card group={captured} candidate={full} />);
    fireEvent.click(screen.getByText("Matches changed"));
    expect(
      await screen.findByRole("button", { name: "Replace with full episode" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Add matching segments" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("distinguishes out-of-results and unavailable episodes while keeping them actionable", () => {
    const view = render(<Card group={captured} candidate={null} />);
    expect(screen.getByText("Not in results")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Open drive.mp4" })
        .hasAttribute("disabled"),
    ).toBe(false);
    view.unmount();
    render(<Card group={{ ...full, unavailable: true }} candidate={null} />);
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText("Not in results")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "drive.mp4 is unavailable" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Remove drive.mp4 from selection" }),
    );
    expect(handlers.remove).toHaveBeenCalledWith("episode");
  });

  it("does not flag an episode as outside the results while its match is unknown", () => {
    render(<Card group={captured} />);
    expect(screen.queryByText("Not in results")).toBeNull();
  });
});
