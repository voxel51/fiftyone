import { getEventBus } from "@fiftyone/events";

/** e2e specs wait on the keyboard landing where the bar moves it a frame late */
type ViewBarE2EEvents = {
  "e2e:view-bar:focus-placed": { target: FocusTarget };
};

type FocusTarget = "insert-slot" | "stage" | "expression";

export const dispatchFocusPlaced = (target: FocusTarget) =>
  getEventBus<ViewBarE2EEvents>().dispatch("e2e:view-bar:focus-placed", {
    target,
  });
