import {
  KnownCommands,
  KnownContexts,
  useKeyBindings,
} from "@fiftyone/commands";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";

const MediaFieldNavigationDirection = {
  Previous: -1,
  Next: 1,
} as const;

type MediaFieldNavigationDirectionValue =
  (typeof MediaFieldNavigationDirection)[keyof typeof MediaFieldNavigationDirection];

/**
 * Hook enabling navigation between media fields.
 */
export const useMediaFieldNavigation = () => {
  const mediaFields = useRecoilValue(fos.mediaFields);
  const [selectedMediaField, setSelectedMediaField] = useRecoilState(
    fos.selectedMediaField(true)
  );

  const hasMultipleMediaFields = Boolean(mediaFields && mediaFields.length > 1);

  const navigate = useCallback(
    (direction: MediaFieldNavigationDirectionValue) => {
      if (!mediaFields || mediaFields.length <= 1) return;
      const currentIndex = mediaFields.indexOf(selectedMediaField);
      if (currentIndex === -1) {
        setSelectedMediaField(mediaFields[0]);
        return;
      }
      const nextIndex =
        (currentIndex + direction + mediaFields.length) % mediaFields.length;
      setSelectedMediaField(mediaFields[nextIndex]);
    },
    [mediaFields, selectedMediaField]
  );

  const bindings = useMemo(
    () =>
      hasMultipleMediaFields
        ? [
            {
              commandId: KnownCommands.ModalPreviousMediaField,
              sequence: "PageUp",
              handler: () => navigate(MediaFieldNavigationDirection.Previous),
              label: "Previous Media Field",
              description: "Switch to the previous media field",
              enablement: () => hasMultipleMediaFields,
            },
            {
              commandId: KnownCommands.ModalNextMediaField,
              sequence: "PageDown",
              handler: () => navigate(MediaFieldNavigationDirection.Next),
              label: "Next Media Field",
              description: "Switch to the next media field",
              enablement: () => hasMultipleMediaFields,
            },
          ]
        : [],
    [hasMultipleMediaFields, navigate]
  );

  useKeyBindings(KnownContexts.Modal, bindings);
};
