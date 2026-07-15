import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Tile, { TileHeader } from "./Tile";

const noop = () => undefined;

describe("Tile chrome", () => {
  afterEach(() => cleanup());

  describe("TileHeader", () => {
    it("renders the title and the close + fullscreen buttons", () => {
      render(
        <TileHeader title="camera_front" onClose={noop} onFullscreen={noop} />,
      );
      expect(screen.getByText("camera_front")).toBeTruthy();
      expect(screen.getByTestId("tile-header-close")).toBeTruthy();
      const fullscreen = screen.getByTestId("tile-header-fullscreen");
      expect(fullscreen).toBeTruthy();
      expect(fullscreen.getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByLabelText("Close")).toBeTruthy();
      expect(screen.getByLabelText("Fullscreen")).toBeTruthy();
    });

    it("emphasizes a cross-panel highlighted title", () => {
      render(
        <TileHeader
          highlighted
          title="camera_front"
          onClose={noop}
          onFullscreen={noop}
        />,
      );
      expect(
        screen
          .getByTestId("tile-header-title")
          .getAttribute("data-highlighted"),
      ).toBe("true");
    });

    it("leaves title emphasis unset by default", () => {
      render(
        <TileHeader title="camera_front" onClose={noop} onFullscreen={noop} />,
      );
      expect(
        screen
          .getByTestId("tile-header-title")
          .getAttribute("data-highlighted"),
      ).toBeNull();
    });

    it("fires onClose when the close button is clicked", () => {
      const onClose = vi.fn();
      render(<TileHeader title="t" onClose={onClose} onFullscreen={noop} />);
      fireEvent.click(screen.getByTestId("tile-header-close"));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("fires onFullscreen when the fullscreen button is clicked", () => {
      const onFullscreen = vi.fn();
      render(
        <TileHeader title="t" onClose={noop} onFullscreen={onFullscreen} />,
      );
      fireEvent.click(screen.getByTestId("tile-header-fullscreen"));
      expect(onFullscreen).toHaveBeenCalledOnce();
    });

    it("shows the inverse fullscreen action while expanded", () => {
      render(
        <TileHeader
          title="t"
          onClose={noop}
          onFullscreen={noop}
          isFullscreen
        />,
      );

      const fullscreen = screen.getByTestId("tile-header-fullscreen");
      expect(fullscreen.getAttribute("aria-label")).toBe("Exit fullscreen");
      expect(fullscreen.getAttribute("aria-pressed")).toBe("true");
      expect(fullscreen.getAttribute("title")).toBe("Exit fullscreen");
    });

    it("hides the split affordance unless its handlers are wired", () => {
      render(<TileHeader title="t" onClose={noop} onFullscreen={noop} />);
      expect(screen.queryByTestId("tile-header-split-hint")).toBeNull();
      expect(screen.queryByTestId("tile-header-split-right")).toBeNull();
      expect(screen.queryByTestId("tile-header-split-down")).toBeNull();
    });

    it("fires onSelect for header clicks but not for its buttons", () => {
      const onSelect = vi.fn();
      render(
        <TileHeader
          title="t"
          onClose={noop}
          onFullscreen={noop}
          onSelect={onSelect}
        />,
      );
      fireEvent.click(screen.getByTestId("tile-header"));
      expect(onSelect).toHaveBeenCalledOnce();
      // Buttons manage focus through their own callbacks; the bubbling
      // click must not also count as a select.
      fireEvent.click(screen.getByTestId("tile-header-fullscreen"));
      expect(onSelect).toHaveBeenCalledOnce();
    });

    it("advertises the split actions with a non-interactive resting glyph", () => {
      render(
        <TileHeader
          title="t"
          onClose={noop}
          onFullscreen={noop}
          onSplitRight={noop}
          onSplitDown={noop}
        />,
      );
      const hint = screen.getByTestId("tile-header-split-hint");
      // Decorative stand-in: skipped by both screen readers and tabbing.
      expect(hint.getAttribute("aria-hidden")).toBe("true");
      expect(hint.getAttribute("tabindex")).toBe("-1");
    });

    it("fires the split callbacks from their buttons", () => {
      const onSplitRight = vi.fn();
      const onSplitDown = vi.fn();
      render(
        <TileHeader
          title="t"
          onClose={noop}
          onFullscreen={noop}
          onSplitRight={onSplitRight}
          onSplitDown={onSplitDown}
        />,
      );
      expect(screen.getByLabelText("Split right")).toBeTruthy();
      expect(screen.getByLabelText("Split down")).toBeTruthy();
      fireEvent.click(screen.getByTestId("tile-header-split-right"));
      expect(onSplitRight).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByTestId("tile-header-split-down"));
      expect(onSplitDown).toHaveBeenCalledOnce();
    });
  });

  describe("Tile", () => {
    it("renders the header and the body content", () => {
      render(
        <Tile title="lidar_top" onClose={noop} onFullscreen={noop}>
          <div data-testid="body">body content</div>
        </Tile>,
      );
      expect(screen.getByText("lidar_top")).toBeTruthy();
      expect(screen.getByTestId("body").textContent).toBe("body content");
    });
  });
});
