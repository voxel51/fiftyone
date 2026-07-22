import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BYTE_SOURCE_READ_PROFILE } from "../../query/bytes/index";
import type { SourcePlaybackProps } from "../episode/index";
import McapExplorerPanel from "./McapExplorerPanel";

const viewerHarness = vi.hoisted(() => ({
  lastPlaybackProps: null as SourcePlaybackProps | null,
  reset() {
    this.lastPlaybackProps = null;
  },
  useEpisodeSession: vi.fn(() => ({
    error: null,
    session: null,
    status: "loading",
  })),
}));

vi.mock("../episode/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../episode/index")>();

  return {
    ...actual,
    SourcePlayback: (props: SourcePlaybackProps) => {
      viewerHarness.lastPlaybackProps = props;

      return (
        <div data-testid="mcap-source-playback">
          <span data-testid="mcap-source-file-name">{props.fileName}</span>
          {props.headerActions}
        </div>
      );
    },
  };
});

vi.mock("../session/use-episode-session", () => ({
  useEpisodeSession: viewerHarness.useEpisodeSession,
}));

describe("McapExplorerPanel", () => {
  beforeEach(() => {
    viewerHarness.reset();
    viewerHarness.useEpisodeSession.mockClear();
  });

  afterEach(() => cleanup());

  it("starts in the empty state", () => {
    render(<McapExplorerPanel />);

    expect(screen.getByText("Drag & drop an MCAP file")).toBeTruthy();
    expect(screen.queryByTestId("mcap-source-playback")).toBeNull();
  });

  it("opens a direct HTTP(S) MCAP URL", () => {
    render(<McapExplorerPanel />);

    fireEvent.change(screen.getByLabelText("Remote MCAP URL"), {
      target: {
        value: "https://example.com/path/recording.mcap?signature=1",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open URL" }));

    expect(screen.getByTestId("mcap-source-file-name").textContent).toBe(
      "recording.mcap",
    );
    expect(viewerHarness.lastPlaybackProps?.source).toEqual({
      readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE,
      sourceId:
        "remote-url:https://example.com/path/recording.mcap?signature=1",
      url: "https://example.com/path/recording.mcap?signature=1",
    });
    expect(screen.queryByText("Drag & drop an MCAP file")).toBeNull();
    expect(screen.queryByLabelText("Remote MCAP URL")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Unmount recording" }),
    ).toBeTruthy();
  });

  it("opens a local MCAP from the file picker", () => {
    render(<McapExplorerPanel />);

    const file = new File(["abc"], "local.mcap", {
      lastModified: 456,
      type: "application/octet-stream",
    });
    fireEvent.change(screen.getByTestId("local-mcap-input"), {
      target: { files: [file] },
    });

    expect(screen.getByTestId("mcap-source-file-name").textContent).toBe(
      "local.mcap",
    );
    expect(viewerHarness.lastPlaybackProps?.layoutScopeKey).toBe(
      "any-mcap:local-file:local.mcap:3:456",
    );
    expect(viewerHarness.lastPlaybackProps?.source).toEqual({
      localFile: file,
      readProfile: BYTE_SOURCE_READ_PROFILE.LOCAL,
      sizeBytes: "3",
      sourceId: "local-file:local.mcap:3:456",
      url: "local-file:local.mcap:3:456",
    });
  });

  it("opens a dropped local MCAP", () => {
    render(<McapExplorerPanel />);

    fireEvent.drop(screen.getByTestId("local-mcap-drop-zone"), {
      dataTransfer: {
        files: [
          new File(["drop"], "drop.mcap", {
            lastModified: 789,
            type: "application/octet-stream",
          }),
        ],
      },
    });

    expect(screen.getByTestId("mcap-source-file-name").textContent).toBe(
      "drop.mcap",
    );
    expect(viewerHarness.lastPlaybackProps?.source?.sourceId).toBe(
      "local-file:drop.mcap:4:789",
    );
  });

  it("uses dropped DataTransfer items when the files list is unavailable", () => {
    render(<McapExplorerPanel />);
    const file = new File(["item"], "item.mcap", {
      lastModified: 111,
      type: "application/octet-stream",
    });

    fireEvent.drop(screen.getByTestId("local-mcap-drop-zone"), {
      dataTransfer: {
        files: [],
        items: [{ getAsFile: () => file, kind: "file" }],
        types: ["Files"],
      },
    });

    expect(screen.getByTestId("mcap-source-file-name").textContent).toBe(
      "item.mcap",
    );
    expect(viewerHarness.lastPlaybackProps?.source?.sourceId).toBe(
      "local-file:item.mcap:4:111",
    );
  });

  it("unmounts the active source and restores the picker", () => {
    render(<McapExplorerPanel />);

    fireEvent.change(screen.getByLabelText("Remote MCAP URL"), {
      target: { value: "https://example.com/run.mcap" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open URL" }));
    fireEvent.click(screen.getByRole("button", { name: "Unmount recording" }));

    expect(screen.getByText("Drag & drop an MCAP file")).toBeTruthy();
    expect(screen.getByTestId("local-mcap-drop-zone")).toBeTruthy();
    expect(screen.queryByTestId("mcap-source-playback")).toBeNull();
  });

  it("keeps the mounted source locked when another file is dropped", () => {
    render(<McapExplorerPanel />);

    fireEvent.change(screen.getByTestId("local-mcap-input"), {
      target: {
        files: [
          new File(["one"], "first.mcap", {
            lastModified: 1,
            type: "application/octet-stream",
          }),
        ],
      },
    });
    fireEvent.drop(screen.getByTestId("mcap-source-playback"), {
      dataTransfer: {
        files: [
          new File(["two"], "second.mcap", {
            lastModified: 2,
            type: "application/octet-stream",
          }),
        ],
      },
    });

    expect(screen.getByTestId("mcap-source-file-name").textContent).toBe(
      "first.mcap",
    );
    expect(viewerHarness.lastPlaybackProps?.source?.sourceId).toBe(
      "local-file:first.mcap:3:1",
    );
  });

  it("shows invalid URL and file errors", () => {
    render(<McapExplorerPanel />);

    fireEvent.change(screen.getByLabelText("Remote MCAP URL"), {
      target: { value: "s3://bucket/file.mcap" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open URL" }));
    expect(
      screen.getByText("Only HTTP(S) MCAP URLs are supported"),
    ).toBeTruthy();

    fireEvent.change(screen.getByTestId("local-mcap-input"), {
      target: {
        files: [new File(["txt"], "notes.txt", { type: "text/plain" })],
      },
    });
    expect(screen.getByText("Choose an .mcap file")).toBeTruthy();
    expect(screen.queryByTestId("mcap-source-playback")).toBeNull();
  });
});
