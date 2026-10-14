import { expect, it, vi } from "vitest";
import { FrameElement } from "../elements/frame";
import type { FrameState } from "../state";
import { FrameLooker } from "./frame";

it("boots frame elements with their event controller and state updater", () => {
  const abortController = new AbortController();
  const updater = vi.fn();
  const dispatchEvent = vi.fn();
  const target = {
    abortController,
    updater,
    getDispatchEvent: () => dispatchEvent,
  };
  const config = {
    frameNumber: 3,
    frameRate: 10,
    thumbnail: false,
  } as FrameState["config"];
  const tree = FrameLooker.prototype.getElements.call(target, config);
  expect(tree.element.getAttribute("data-cy")).toBe("looker");
  expect(tree.children[0]).toBeInstanceOf(FrameElement);
  abortController.abort();
});
