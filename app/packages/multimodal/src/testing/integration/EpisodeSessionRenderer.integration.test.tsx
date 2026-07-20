import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFixtureFormatAdapter } from "../../adapters/fixture";
import type { ByteResources, EpisodeSource } from "../../ports";
import { EpisodeSessionRenderer } from "../../views/EpisodeSessionRenderer";

vi.mock("../../visualization/panels/image", () => ({
  ImagePanel: ({ alt }: { alt: string }) => (
    <div data-testid="neutral-image-panel">{alt}</div>
  ),
}));

vi.mock("../../visualization/panels/point-cloud", () => ({
  PointCloudPanel: () => <div data-testid="neutral-3d-panel">3D</div>,
}));

const source: EpisodeSource = {
  assets: {
    list: async () => [],
    resolve: async () => {
      throw new Error("Fixture adapter has no physical assets");
    },
  },
  episodeId: "fixture-episode",
};

const io: ByteResources = {
  readBytes: async () => {
    throw new Error("Fixture adapter has no physical bytes");
  },
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("format-agnostic episode session renderer", () => {
  it("renders a fixture modal and advances its shared timeline", async () => {
    const session = await createFixtureFormatAdapter().open(source, io);
    try {
      render(<EpisodeSessionRenderer session={session} />);

      await waitFor(() =>
        expect(screen.getByLabelText("Fixture image")).not.toBeNull(),
      );
      const imageTile = screen.getByLabelText("Fixture image");
      expect(
        within(imageTile).getByTestId("neutral-image-panel").textContent,
      ).toContain("fixture-image");
      expect(screen.getByLabelText("Episode playhead").textContent).toContain(
        "0.00s / 0.30s",
      );

      vi.useFakeTimers();
      fireEvent.click(screen.getByRole("button", { name: "Play episode" }));
      await act(async () => vi.advanceTimersByTimeAsync(110));
      expect(screen.getByLabelText("Episode playhead").textContent).toContain(
        "0.10s / 0.30s",
      );
      expect(
        screen.getByRole("button", { name: "Pause episode" }),
      ).not.toBeNull();
    } finally {
      session.dispose();
    }
  });

  it("renders the fixture grid through the same session port", async () => {
    const session = await createFixtureFormatAdapter().open(source, io);
    try {
      render(<EpisodeSessionRenderer session={session} variant="grid" />);
      const grid = screen.getByTestId("episode-session-grid");
      await waitFor(() =>
        expect(within(grid).getByTestId("neutral-image-panel")).not.toBeNull(),
      );
      expect(grid.getAttribute("aria-label")).toBe("fixture-episode episode");
    } finally {
      session.dispose();
    }
  });
});
