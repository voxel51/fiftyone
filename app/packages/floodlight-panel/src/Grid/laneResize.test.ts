import { afterEach, describe, expect, test, vi } from "vitest";
import { LANE_HEIGHT_STEP, MAX_LANE_HEIGHT } from "./laneHeights";
import { attachLaneResize } from "./laneResize";

const setup = (height = 200) => {
  const host = document.createElement("div");
  const handle = document.createElement("div");
  host.appendChild(handle);
  document.body.appendChild(host);
  const commit = vi.fn();
  const reset = vi.fn();
  const detach = attachLaneResize(handle, {
    commit,
    edge: () => 300,
    guideHost: () => host,
    height: () => height,
    reset,
  });
  const pointer = (type: string, clientY: number) =>
    handle.dispatchEvent(
      new MouseEvent(type, { bubbles: true, button: 0, clientY }),
    );
  const key = (key: string) =>
    handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
  const guide = () => host.querySelector<HTMLElement>(":scope > div + div");
  return { commit, detach, guide, handle, key, pointer, reset };
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("attachLaneResize", () => {
  test("moves only a guide mid-drag and commits on release", () => {
    const { commit, guide, pointer } = setup();
    pointer("pointerdown", 100);
    pointer("pointermove", 150);

    expect(guide()!.style.top).toBe("350px");
    expect(commit).not.toHaveBeenCalled();

    pointer("pointerup", 150);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(250);
    expect(guide()).toBe(null);
  });

  test("clamps the dragged height", () => {
    const { commit, pointer } = setup();
    pointer("pointerdown", 0);
    pointer("pointermove", 5000);
    pointer("pointerup", 5000);

    expect(commit).toHaveBeenCalledWith(MAX_LANE_HEIGHT);
  });

  test("does not commit a drag that ends where it started or is cancelled", () => {
    const { commit, pointer } = setup();
    pointer("pointerdown", 100);
    pointer("pointerup", 100);
    pointer("pointerdown", 100);
    pointer("pointermove", 180);
    pointer("pointercancel", 180);

    expect(commit).not.toHaveBeenCalled();
  });

  test("steps with the arrow keys and commits on Enter", () => {
    const { commit, guide, key } = setup();
    key("ArrowDown");
    key("ArrowDown");
    key("ArrowUp");

    expect(guide()!.style.top).toBe(`${300 + LANE_HEIGHT_STEP}px`);
    key("Enter");
    expect(commit).toHaveBeenCalledWith(200 + LANE_HEIGHT_STEP);
  });

  test("Escape discards a keyboard resize", () => {
    const { commit, guide, key } = setup();
    key("ArrowUp");
    key("Escape");

    expect(guide()).toBe(null);
    expect(commit).not.toHaveBeenCalled();
  });

  test("double-click resets", () => {
    const { handle, reset } = setup();
    handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
