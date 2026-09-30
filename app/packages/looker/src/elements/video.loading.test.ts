import { describe, expect, it } from "vitest";
import type { VideoState } from "../state";
import { createLoadingIndicator } from "./common/loading";
import { lookerLoadingShown } from "./common/looker.module.css";
import { LoadingElement } from "./video";

const loadingElement = () => {
  const element = Object.create(LoadingElement.prototype) as LoadingElement;
  element.element = createLoadingIndicator();
  return element;
};

const shownFor = (
  element: LoadingElement,
  state: Pick<VideoState, "loaded" | "error">,
) => {
  element.renderSelf(state as Readonly<VideoState>);
  return element.element.classList.contains(lookerLoadingShown);
};

describe("LoadingElement", () => {
  it("animates until the thumbnail's media draws", () => {
    const element = loadingElement();

    expect(shownFor(element, { loaded: false, error: false })).toBe(true);
    expect(shownFor(element, { loaded: true, error: false })).toBe(false);
  });

  it("stops when the media fails, leaving the error to show", () => {
    const element = loadingElement();

    expect(shownFor(element, { loaded: false, error: false })).toBe(true);
    expect(shownFor(element, { loaded: false, error: true })).toBe(false);
  });

  it("is announced as a loading status, its box hidden from screen readers", () => {
    const indicator = createLoadingIndicator();

    expect(indicator.getAttribute("role")).toBe("status");
    expect(indicator.getAttribute("aria-label")).toBe("Loading");
    expect(indicator.firstElementChild?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});
