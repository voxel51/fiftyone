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
    assertPanelId(registerPanelId);
    if (!events[registerPanelId]) {
      events[registerPanelId] = {};
    }
    events[registerPanelId][event] = callback;
  }

  function trigger(event: string, params: unknown, panelId?: string) {
    const triggerPanelId = panelId ?? computedPanelId;
    assertPanelId(triggerPanelId);
    const callback = events[triggerPanelId]?.[event];
    if (callback) {
      callback(params);
    }
  }

  function unregister(event: string, panelId?: string) {
    const unregisterPanelId = panelId ?? computedPanelId;
    assertPanelId(unregisterPanelId);
    if (events[unregisterPanelId]) {
      delete events[unregisterPanelId][event];
    }
  }

  return { register, trigger, unregister };
}

function assertPanelId(panelId?: string) {
  if (!panelId) {
    throw new Error("Panel ID is required");
  }
  return panelId;
}

type PanelEventHandler = (params: unknown) => void;
type PanelEvents = {
  [key: string]: PanelEventHandler;
};
type PanelsEvents = {
  [key: string]: PanelEvents;
};
