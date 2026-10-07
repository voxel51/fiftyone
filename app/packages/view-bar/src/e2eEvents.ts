import { getEventBus } from "@fiftyone/events";

/**
 * e2e specs wait on the stages row showing the stages a view brings in, and
 * on an expression's code editor mounting, which loads after the stage
 * editor opens
 */
type ViewBarE2EEvents = {
  "e2e:view-bar:stages-shown": { count: number };
  "e2e:view-bar:expression-mounted": undefined;
};

export const dispatchStagesShown = (count: number) =>
  getEventBus<ViewBarE2EEvents>().dispatch("e2e:view-bar:stages-shown", {
    count,
  });

export const dispatchExpressionMounted = () =>
  getEventBus<ViewBarE2EEvents>().dispatch("e2e:view-bar:expression-mounted");
