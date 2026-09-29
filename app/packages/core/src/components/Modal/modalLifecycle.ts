import { getEventBus } from "@fiftyone/events";
import { useEffect } from "react";

/** e2e specs wait on the modal mounting and unmounting */
type ModalLifecycleE2EEvents = {
  "e2e:modal:opened": undefined;
  "e2e:modal:closed": undefined;
};

export const useModalLifecycleSignal = () =>
  useEffect(() => {
    const bus = getEventBus<ModalLifecycleE2EEvents>();
    bus.dispatch("e2e:modal:opened");
    return () => bus.dispatch("e2e:modal:closed");
  }, []);
