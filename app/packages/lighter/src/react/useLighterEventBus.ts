import { useEventBus } from "@fiftyone/events";
import { LighterEventGroup } from "../events";

export const useLighterEventBus = (eventChannel: string) =>
  useEventBus<LighterEventGroup>(eventChannel);
