import Spotlight, { type SpotlightConfig } from "@fiftyone/floodlight";
import type { Renderer } from "../host/ownership";
import type { Environment } from "./environment";
import type { FakeItem } from "./fakePages";

type Data = FakeItem["data"];

export type Engine = Spotlight<number, Data>;

export type EngineOptions = Partial<SpotlightConfig<number, Data>> &
  Pick<SpotlightConfig<number, Data>, "get"> &
  Renderer<number, Data>;

/** Five square items per row at the default spacing. */
export const ROW_ASPECT_RATIO = 5;

/** A real engine instance whose `load` events are counted. */
export const createEngine = (options: EngineOptions) => {
  const spotlight: Engine = new Spotlight<number, Data>({
    key: 0,
    rowAspectRatioThreshold: () => ROW_ASPECT_RATIO,
    ...options,
  });
  const events = { load: 0, rowchange: 0 };
  spotlight.addEventListener("load", () => events.load++);
  spotlight.addEventListener("rowchange", () => events.rowchange++);
  return { events, spotlight };
};

/** A positioned container in the document for an engine or host. */
export const createContainer = () => {
  const container = document.createElement("div");
  container.style.position = "relative";
  document.body.append(container);
  return container;
};

/** The engine's scroll element is the only child it appends. */
export const scroller = (container: HTMLElement) =>
  container.firstElementChild as HTMLElement;

/**
 * Scrolls like a user: a scroll event, a few frames of the scroll reader's
 * loop, then the polyfilled `scrollend` after its debounce.
 */
export const scrollTo = async (
  env: Environment,
  element: HTMLElement,
  position: number,
  horizontal = false,
) => {
  if (horizontal) element.scrollLeft = position;
  else element.scrollTop = position;
  element.dispatchEvent(new Event("scroll"));
  await env.idle(4);
  await env.tick(300);
  await env.idle();
};
