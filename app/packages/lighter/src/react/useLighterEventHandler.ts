import { createUseEventHandler } from "@fiftyone/events";
import { LighterEventGroup } from "../events";

export const useLighterEventHandler =
  createUseEventHandler<LighterEventGroup>();
