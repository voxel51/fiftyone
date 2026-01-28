import {
  KnownCommands,
  KnownContexts,
  useKeyBindings,
} from "@fiftyone/commands";
import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";

const MediaFieldNavigationDirection = {
  Previous: -1,
  Next: 1,
} as const;

type MediaFieldNavigationDirectionValue = typeof MediaFieldNavigationDirection[keyof typeof MediaFieldNavigationDirection];

/**
 * Hook enabling navigation between media fields.
 */
export const useMediaFieldNavigation = () => {
  const mediaFields = useRecoilValue(fos.mediaFields);

  const hasMultipleMediaFields = Boolean(mediaFields && mediaFields.length > 1);

  const navigate = useRecoilCallback(
    ({ snapshot, set }) => async (
      direction: MediaFieldNavigationDirectionValue
    ) => {
      if (!mediaFields || mediaFields.length <= 1) return;
      const currentSelected = await snapshot.getPromise(
        fos.selectedMediaField(true)
      );
      const currentIndex = mediaFields.indexOf(currentSelected);
      if (currentIndex === -1) {
        set(fos.selectedMediaField(true), mediaFields[0]);
        return;
      }
      const nextIndex =
        (currentIndex + direction + mediaFields.length) % mediaFields.length;
      set(fos.selectedMediaField(true), mediaFields[nextIndex]);
    },
    [mediaFields]
  );

  const bindings = useMemo(
    () => [
      {
        commandId: KnownCommands.ModalPreviousMediaField,
        sequence: "PageUp",
        handler: () => {
          navigate(MediaFieldNavigationDirection.Previous);
        },
        label: "Previous Media Field",
        description: "Switch to the previous media field",
        enablement: () => hasMultipleMediaFields,
      },
      {
        commandId: KnownCommands.ModalNextMediaField,
        sequence: "PageDown",
        handler: () => {
          navigate(MediaFieldNavigationDirection.Next);
        },
        label: "Next Media Field",
        description: "Switch to the next media field",
        enablement: () => hasMultipleMediaFields,
      },
    ],
    [hasMultipleMediaFields, navigate]
  );

  useKeyBindings(KnownContexts.Modal, bindings);
};
