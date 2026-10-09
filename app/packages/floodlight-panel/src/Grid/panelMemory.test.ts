import { describe, expect, it, vi } from "vitest";
import { panelValue } from "./panelMemory";

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
});
