/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useSidebarSlide from "./useSidebarSlide";

let finish: () => void;

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  HTMLElement.prototype.animate = vi.fn(() => {
    const finished = new Promise<void>((resolve) => (finish = resolve));
    return { finished, cancel: vi.fn() } as unknown as Animation;
  });
});

afterEach(() => {
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
});

const setup = (show: boolean) => {
  const el = document.createElement("div");
  Object.defineProperty(el, "offsetWidth", { value: 300 });
  const hook = renderHook(
    ({ show }) => {
      const slide = useSidebarSlide(show);
      (slide.sidebar as { current: HTMLDivElement | null }).current = el;
      return slide;
    },
    { initialProps: { show } },
  );
  return hook;
};

describe("useSidebarSlide", () => {
  it("frees the grid's width as the sidebar starts sliding out", async () => {
    const { rerender, result } = setup(true);
    rerender({ show: false });

    expect(result.current.rendered).toBe(true);
    expect(result.current.sidebarStyle?.position).toBe("absolute");
    expect(result.current.gridStyle).toBeUndefined();

    await act(async () => finish());
    expect(result.current.rendered).toBe(false);
  });

  it("makes room in the grid as the sidebar starts sliding in", async () => {
    const { rerender, result } = setup(false);
    rerender({ show: true });

    expect(result.current.sidebarStyle?.position).toBe("absolute");
    expect(result.current.gridStyle).toEqual({ marginLeft: 308 });

    await act(async () => finish());
    expect(result.current.sidebarStyle).toBeUndefined();
    expect(result.current.gridStyle).toBeUndefined();
  });
});
