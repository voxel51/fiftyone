export { E2E_EVENT_PREFIX, EventDispatcher, tapAllEvents } from "./dispatcher";
export { forwardingLegacyDomEvent, isLegacyDomMirror } from "./legacyDomEvents";
export { LocalEventTarget, type LocalEvent } from "./local-target";
export { DEFAULT_CHANNEL_ID, getEventBus, clearChannel } from "./registry";
