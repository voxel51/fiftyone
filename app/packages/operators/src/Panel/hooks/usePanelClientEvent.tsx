import { usePanelId } from "@fiftyone/spaces";

const events: PanelsEvents = {};

export default function usePanelEvents(panelId?: string) {
  const id = usePanelId();
  const computedPanelId = panelId ?? id;

  function register(
    event: string,
    callback: PanelEventHandler,
    panelId?: string
  ) {
    const registerPanelId = panelId ?? computedPanelId;
    if (!events[registerPanelId]) {
      events[registerPanelId] = {};
    }
    events[registerPanelId][event] = callback;
  }

  function trigger(event: string, params: unknown, panelId?: string) {
    const triggerPanelId = panelId ?? computedPanelId;
    const callback = events[triggerPanelId]?.[event];
    if (callback) {
      callback(params);
    }
  }

  return { register, trigger };
}

type PanelEventHandler = (params: unknown) => void;
type PanelEvents = {
  [key: string]: PanelEventHandler;
};
type PanelsEvents = {
  [key: string]: PanelEvents;
};
