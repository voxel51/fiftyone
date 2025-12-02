import { useEventBus } from "@fiftyone/events";
import { LighterEventGroup } from "../events";

export const useLighterEventBus = () => useEventBus<LighterEventGroup>();
