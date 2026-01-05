import { useEventBus } from "@fiftyone/events";
import { LighterEventGroup } from "../events";

export const useLighterEventBus = (sceneId: string) =>
  useEventBus<LighterEventGroup>(sceneId);
