import { useAnnotationEventHandler } from "@fiftyone/annotation";
import useTrackEvent from "@fiftyone/analytics/src/useTrackEvent";
import { useCallback } from "react";

/**
 * Hook that tracks annotation analytics events.
 */
export function useAnnotationTracking() {
  const trackEvent = useTrackEvent();

  useAnnotationEventHandler(
    "annotation:persistenceSuccess",
    useCallback(() => {
      trackEvent("ha_label_saved");
    }, [trackEvent])
  );

  useAnnotationEventHandler(
    "annotation:persistenceError",
    useCallback(() => {
      trackEvent("ha_label_error");
    }, [trackEvent])
  );

  useAnnotationEventHandler(
    "annotation:deleteSuccess",
    useCallback(
      (payload) => {
        if (payload.labelType) {
          trackEvent("ha_label_deleted", { label_type: payload.labelType });
        } else {
          trackEvent("ha_label_deleted");
        }
      },
      [trackEvent]
    )
  );
}
