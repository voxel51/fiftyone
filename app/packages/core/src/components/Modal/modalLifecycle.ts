import { getEventBus } from "@fiftyone/events";
import { useEffect } from "react";

/** e2e specs wait on the modal mounting; the app renderer signals closing */
type ModalLifecycleE2EEvents = {
  "e2e:modal:opened": undefined;
};

export const useModalLifecycleSignal = () =>
  useEffect(() => {
    getEventBus<ModalLifecycleE2EEvents>().dispatch("e2e:modal:opened");
  }, []);
