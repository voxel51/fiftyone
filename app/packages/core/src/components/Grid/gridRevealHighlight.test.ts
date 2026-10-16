import { afterEach, describe, expect, it, vi } from "vitest";
import {
  highlightRevealedTile,
  registerTile,
  setTileHighlight,
  unregisterTile,
} from "./gridTileRegistry";

function tile() {
  const root = document.createElement("div");
  const overlayEl = document.createElement("div");
  root.append(overlayEl);
  registerTile({ id: "target", overlayEl, sample: {} });
  return root;
}
afterEach(() => {
  unregisterTile("target");
  vi.useRealTimers();
});

describe("arrival highlight", () => {
  it("waits for the actual tile and cleans up independently of tray hover", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = highlightRevealedTile("target", controller.signal);
    const root = tile();
    await pending;
    expect(root.hasAttribute("data-fo-tile-revealed")).toBe(true);
    setTileHighlight("target", true);
    await vi.advanceTimersByTimeAsync(900);
    expect(root.hasAttribute("data-fo-tile-revealed")).toBe(false);
    expect(root.hasAttribute("data-fo-tile-highlight")).toBe(true);
  });
  it("cancels a pending highlight without leaving a subscription", async () => {
    const controller = new AbortController();
    const pending = highlightRevealedTile("target", controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(tile().hasAttribute("data-fo-tile-revealed")).toBe(false);
  });
  it("clears a highlight when the tile is recycled", async () => {
    const root = tile();
    await highlightRevealedTile("target", new AbortController().signal);
    unregisterTile("target");
    expect(root.hasAttribute("data-fo-tile-revealed")).toBe(false);
  });
});
