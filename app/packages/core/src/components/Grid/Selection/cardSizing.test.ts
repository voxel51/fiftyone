import { describe, expect, it } from "vitest";
import { fitCardHeight, type TrayItem } from "./cardSizing";
import { CARD_HEIGHT, cardWidth, MULTIMODAL_CARD_HEIGHT } from "./theme";

const square: TrayItem = { aspectRatio: 1 };

describe("selection card sizing", () => {
  it("fills the height with widths following landscape and portrait media", () => {
    const height = fitCardHeight(
      [{ aspectRatio: 16 / 9 }, { aspectRatio: 9 / 16 }],
      900,
      300,
      false,
    );
    expect(height).toBe(300);
    expect(cardWidth(16 / 9, height)).toBe(530);
    expect(cardWidth(9 / 16, height)).toBe(168);
  });

  it("uses multiple rows and fills their height when all cards fit", () => {
    expect(fitCardHeight(Array(4).fill(square), 500, 300, false)).toBe(146);
  });

  it("keeps overflowing selections at their minimum height", () => {
    expect(fitCardHeight(Array(100).fill(square), 500, 300, false)).toBe(
      CARD_HEIGHT,
    );
    expect(fitCardHeight(Array(100).fill(square), 500, 300, true)).toBe(
      MULTIMODAL_CARD_HEIGHT,
    );
  });

  it("keeps multimodal cards square as the tray grows", () => {
    expect(fitCardHeight([square], 500, 300, true)).toBe(300);
    expect(fitCardHeight(Array(4).fill(square), 500, 300, true)).toBe(146);
  });

  it("limits growth by bucket width to preserve the media shape", () => {
    expect(fitCardHeight([square], 200, 300, true)).toBe(200);
    expect(fitCardHeight([square], 200, 300, false)).toBe(202);
    expect(fitCardHeight([square], 80, 300, false)).toBe(CARD_HEIGHT);
  });

  it("includes a fold's fixed width in the row packing", () => {
    expect(
      fitCardHeight([square, { fold: true }, square], 500, 200, false),
    ).toBe(191);
  });

  it("handles unknown ratios, empty and collapsed areas", () => {
    expect(fitCardHeight([{ aspectRatio: null }], 1000, 300, false)).toBe(300);
    expect(fitCardHeight([], 1000, 300, false)).toBe(CARD_HEIGHT);
    expect(fitCardHeight([square], 1000, 0, false)).toBe(CARD_HEIGHT);
    expect(fitCardHeight([square], 0, 300, false)).toBe(CARD_HEIGHT);
  });
});
