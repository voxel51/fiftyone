import { getEventBus } from "@fiftyone/events";

/**
 * e2e specs wait on the keyboard landing where the bar moves it a frame late,
 * on a stage editor or the search settings opening and closing, and on the
 * stages row showing its stages
 */
type ViewBarE2EEvents = {
  "e2e:view-bar:focus-placed": { target: FocusTarget };
  "e2e:view-bar:stage-editor": { open: boolean };
  "e2e:view-bar:search-settings": { open: boolean };
  "e2e:view-bar:stages-shown": { count: number };
};

type FocusTarget = "insert-slot" | "stage" | "expression";

export const dispatchFocusPlaced = (target: FocusTarget) =>
  getEventBus<ViewBarE2EEvents>().dispatch("e2e:view-bar:focus-placed", {
    target,
  });

export const dispatchStageEditor = (open: boolean) =>
  getEventBus<ViewBarE2EEvents>().dispatch("e2e:view-bar:stage-editor", {
    open,
  });

export const dispatchSearchSettings = (open: boolean) =>
  getEventBus<ViewBarE2EEvents>().dispatch("e2e:view-bar:search-settings", {
    open,
  });

export const dispatchStagesShown = (count: number) =>
  getEventBus<ViewBarE2EEvents>().dispatch("e2e:view-bar:stages-shown", {
    count,
  });
