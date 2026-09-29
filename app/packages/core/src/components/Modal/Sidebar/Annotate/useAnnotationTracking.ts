/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEventHandler } from "@fiftyone/annotation";
import useTrackEvent from "@fiftyone/analytics/src/useTrackEvent";
import { useAnnotationSurface } from "@fiftyone/state";
import { useCallback, useEffect } from "react";

/**
 * Reports annotation usage: the surface a user opens and the saves, errors
 * and deletes made on it, each tagged with that surface.
 */
export function useAnnotationTracking() {
  const trackEvent = useTrackEvent();
  const surface = useAnnotationSurface();

  useEffect(() => {
    if (surface) {
      trackEvent("ha_surface_opened", { surface });
    }
  }, [surface, trackEvent]);

  useAnnotationEventHandler(
    "annotation:persistenceSuccess",
    useCallback(() => {
      trackEvent("ha_label_saved", { surface });
    }, [surface, trackEvent]),
  );

  useAnnotationEventHandler(
    "annotation:persistenceError",
    useCallback(() => {
      trackEvent("ha_label_error", { surface });
    }, [surface, trackEvent]),
  );

  useAnnotationEventHandler(
    "annotation:deleteSuccess",
    useCallback(
      (payload) => {
        trackEvent("ha_label_deleted", {
          surface,
          ...(payload.labelType ? { label_type: payload.labelType } : {}),
        });
      },
      [surface, trackEvent],
    ),
  );
}
