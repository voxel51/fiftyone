import { describe, expect, it, vi } from "vitest";
import { MAX_IDLE_PANELS, mountPanel, panelValue } from "./panelMemory";

describe("panelValue", () => {
  it("keeps a panel's value while its key holds", () => {
    const first = panelValue("p", "records", "a", () => new Map());
    expect(panelValue("p", "records", "a", () => new Map())).toBe(first);
  });

  it("disposes the old value for a new key", () => {
    const dispose = vi.fn();
    const first = panelValue("q", "cache", "a", () => ({}), dispose);
    const next = panelValue("q", "cache", "b", () => ({}), dispose);
    expect(next).not.toBe(first);
    expect(dispose).toHaveBeenCalledWith(first);
  });

  it("keeps panels and names apart", () => {
    const value = panelValue("r", "a", "k", () => ({}));
    expect(panelValue("s", "a", "k", () => ({}))).not.toBe(value);
    expect(panelValue("r", "b", "k", () => ({}))).not.toBe(value);
  });

  it("holds a bounded number of idle panels, never a mounted one", () => {
    const dispose = vi.fn();
    const unmount = mountPanel("open");
    const open = panelValue("open", "items", "k", () => ({}), dispose);

    for (let i = 0; i < 100; i++) {
      const closed = mountPanel(`closed-${i}`);
      panelValue(`closed-${i}`, "items", "k", () => ({}), dispose);
      closed();
    }

    expect(dispose).toHaveBeenCalledTimes(100 - MAX_IDLE_PANELS);
    expect(panelValue("open", "items", "k", () => ({}))).toBe(open);
    expect(dispose.mock.calls.some(([value]) => value === open)).toBe(false);
    unmount();
  });
});
