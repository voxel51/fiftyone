import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as voodoMock from "../../__tests__/voodo-mock";

vi.mock("@voxel51/voodo", () => voodoMock);

// Mocks must register before the SUT pulls voodo transitively.
// eslint-disable-next-line import/first
import Tile, { TileHeader } from "./Tile";

describe("Tile chrome", () => {
  afterEach(() => cleanup());

  describe("TileHeader", () => {
    it("renders the title and the close + fullscreen buttons", () => {
      render(
        <TileHeader title="camera_front" onClose={() => {}} onFullscreen={() => {}} />
      );
      expect(screen.getByText("camera_front")).toBeTruthy();
      expect(screen.getByTestId("tile-header-close")).toBeTruthy();
      expect(screen.getByTestId("tile-header-fullscreen")).toBeTruthy();
      expect(screen.getByLabelText("Close")).toBeTruthy();
      expect(screen.getByLabelText("Fullscreen")).toBeTruthy();
    });

    it("fires onClose when the close button is clicked", () => {
      const onClose = vi.fn();
      render(<TileHeader title="t" onClose={onClose} onFullscreen={() => {}} />);
      fireEvent.click(screen.getByTestId("tile-header-close"));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("fires onFullscreen when the fullscreen button is clicked", () => {
      const onFullscreen = vi.fn();
      render(<TileHeader title="t" onClose={() => {}} onFullscreen={onFullscreen} />);
      fireEvent.click(screen.getByTestId("tile-header-fullscreen"));
      expect(onFullscreen).toHaveBeenCalledOnce();
    });
  });

  describe("Tile", () => {
    it("renders the header and the body content", () => {
      render(
        <Tile title="lidar_top" onClose={() => {}} onFullscreen={() => {}}>
          <div data-testid="body">body content</div>
        </Tile>
      );
      expect(screen.getByText("lidar_top")).toBeTruthy();
      expect(screen.getByTestId("body").textContent).toBe("body content");
    });
  });
});
