/**
 * Backward compatibility for plugins: the App used to send these events as
 * DOM CustomEvents, and now sends them on the event bus. Each bus event below
 * is also dispatched as its old DOM event, with the same name, target and
 * `detail` as before, so a plugin listening for it keeps working.
 *
 * The list is closed. CI pins it (`e2e-pw/scripts/check-e2e-events.py`), and
 * nothing outside this module can add to it: new App events go on the bus
 * only.
 *
 * @deprecated every entry; listen on the `@fiftyone/events` bus instead.
 */
import { tapAllEvents } from "./dispatcher";

type Payload = Record<string, unknown> | undefined;

interface LegacyDomEvent {
  /** the bus event that is mirrored */
  readonly bus: string;
  /** the DOM event's name, or its prefix when `suffix` completes it */
  readonly name: string;
  readonly suffix?: (payload: Payload) => string;
  readonly target: (payload: Payload) => EventTarget | null | undefined;
  /** the DOM event's `detail`, as main sent it; none when absent */
  readonly detail?: (payload: Payload) => unknown;
  readonly bubbles?: boolean;
}

const onWindow = () => window;
const onDocument = () => document;
const whole = (payload: Payload) => payload;

const LEGACY_DOM_EVENTS: readonly LegacyDomEvent[] = Object.freeze([
  // @deprecated playback timeline commands, on window
  {
    bus: "timeline:play",
    name: "play",
    target: onWindow,
    detail: (p) => ({ timelineName: p?.timelineName }),
  },
  {
    bus: "timeline:pause",
    name: "pause",
    target: onWindow,
    detail: (p) => ({ timelineName: p?.timelineName }),
  },
  {
    bus: "timeline:seek",
    name: "seek",
    target: onWindow,
    detail: (p) => ({ timelineName: p?.timelineName, start: p?.start }),
  },
  {
    bus: "timeline:set-frame-number",
    name: "set-frame-number-",
    suffix: (p) => String(p?.timelineName),
    target: onWindow,
    detail: (p) => ({ frameNumber: p?.frameNumber }),
  },
  // @deprecated imavid frames landed in a controller's store, on window
  {
    bus: "imavid:fetched",
    name: "fetchMore",
    target: onWindow,
    detail: (p) => ({ id: p?.id }),
  },
  // @deprecated a tooltip row hid or showed a label, on window
  {
    bus: "fo-hide-label-change",
    name: "fo-hide-label-change",
    target: onWindow,
  },
  // @deprecated a frame loader view received frames, on window
  {
    bus: "frames-loaded",
    name: "frames-loaded",
    target: onWindow,
    detail: whole,
  },
  // @deprecated 3D viewer commands, on window
  {
    bus: "fo-action-set-top-view",
    name: "fo-action-set-top-view",
    target: onWindow,
  },
  {
    bus: "fo-action-set-ego-view",
    name: "fo-action-set-ego-view",
    target: onWindow,
  },
  {
    bus: "fo-action-zoom-to-selected",
    name: "fo-action-zoom-to-selected",
    target: onWindow,
  },
  // @deprecated the grid showed its first page, on document
  { bus: "grid-mount", name: "grid-mount", target: onDocument, detail: whole },
  // @deprecated a 3D look-at settled, on document
  {
    bus: "looker3d-camera-look-at-settled",
    name: "looker3d-camera-look-at-settled",
    target: onDocument,
  },
  // @deprecated a sidebar's entries settled, on (and bubbling from) its container
  {
    bus: "animation-onRest",
    name: "animation-onRest",
    target: (p) => p?.container as EventTarget | undefined,
    bubbles: true,
  },
]);

const byBus = new Map(LEGACY_DOM_EVENTS.map((entry) => [entry.bus, entry]));

/** DOM events this module dispatched, so App listeners can skip them */
const mirrored = new WeakSet<Event>();

let forwarding = 0;

/**
 * Whether `event` is the App's own mirror of a bus event. App code that still
 * listens for an old DOM event (to take a plugin's command) skips these, or
 * it would handle the App's own event twice.
 */
export const isLegacyDomMirror = (event: Event): boolean => mirrored.has(event);

/**
 * Run `forward`, which puts a plugin's old DOM event onto the bus, without
 * mirroring that bus event back to the DOM
 */
export const forwardingLegacyDomEvent = (forward: () => void): void => {
  forwarding += 1;
  try {
    forward();
  } finally {
    forwarding -= 1;
  }
};

if (typeof window !== "undefined") {
  tapAllEvents((busEvent, data) => {
    const entry = byBus.get(busEvent);
    if (!entry || forwarding) return;
    const payload = data as Payload;
    const target = entry.target(payload);
    if (!target) return;
    const name = entry.suffix ? entry.name + entry.suffix(payload) : entry.name;
    const event = new CustomEvent(name, {
      detail: entry.detail?.(payload),
      bubbles: entry.bubbles ?? false,
    });
    mirrored.add(event);
    target.dispatchEvent(event);
  });
}
