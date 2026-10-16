import { afterEach, expect, it, vi } from "vitest";
import type { ImageState } from "../state";
import { ImageElement } from "./image";

afterEach(() => vi.useRealTimers());

it("cancels image loading and pending retries when the looker is destroyed", () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const element = new ImageElement();
  const config = { src: "/image.jpg", thumbnail: true } as ImageState["config"];
  const update = vi.fn();
  element.boot({
    abortController: controller,
    config,
    dispatchEvent: vi.fn(),
    update,
  });
  element.renderSelf({ config } as ImageState);
  expect(element.element.getAttribute("src")).toBe("/image.jpg");
  element.element.dispatchEvent(new Event("error"));
  expect(vi.getTimerCount()).toBe(1);
  controller.abort();
  expect(element.element.hasAttribute("src")).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  vi.runAllTimers();
  element.element.dispatchEvent(new Event("load"));
  expect(update).toHaveBeenCalledTimes(1);
  expect(element.element.hasAttribute("src")).toBe(false);
});
