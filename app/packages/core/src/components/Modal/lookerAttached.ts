import { getEventBus } from "@fiftyone/events";

/** e2e specs wait on the modal looker a sample change or media switch attaches */
type ModalLookerE2EEvents = {
  "e2e:modal:looker-attached": undefined;
};

export const dispatchLookerAttached = () =>
  getEventBus<ModalLookerE2EEvents>().dispatch("e2e:modal:looker-attached");
