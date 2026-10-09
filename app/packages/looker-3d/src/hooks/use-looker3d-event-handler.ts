import { createUseEventHandler } from "@fiftyone/events";
import type { Looker3dEvents } from "../constants";

/** Handles one of the 3D viewer's bus events while the component is mounted */
export const useLooker3dEventHandler = createUseEventHandler<Looker3dEvents>();
