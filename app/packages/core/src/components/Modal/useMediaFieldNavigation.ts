import {
  KnownCommands,
  KnownContexts,
  useKeyBindings,
} from "@fiftyone/commands";
import * as fos from "@fiftyone/state";
import { useRecoilState, useRecoilValue } from "recoil";

/**
 * Hook enabling navigation between media fields .
 */
export const useMediaFieldNavigation = () => {
  const mediaFields = useRecoilValue(fos.mediaFields);
  const [selectedMediaField, setSelectedMediaField] = useRecoilState(
    fos.selectedMediaField(true)
  );

  const hasMultipleMediaFields = Boolean(mediaFields && mediaFields.length > 1);

  const navigate = (direction: 1 | -1) => {
    if (!mediaFields || mediaFields.length <= 1) return;
    const currentIndex = mediaFields.indexOf(selectedMediaField);
    const nextIndex =
      (currentIndex + direction + mediaFields.length) % mediaFields.length;
    setSelectedMediaField(mediaFields[nextIndex]);
  };

  useKeyBindings(
    KnownContexts.Modal,
    hasMultipleMediaFields
      ? [
          {
            commandId: KnownCommands.ModalPreviousMediaField,
            sequence: "PageUp",
            handler: () => navigate(-1),
            label: "Previous Media Field",
            description: "Switch to the previous media field",
          },
          {
            commandId: KnownCommands.ModalNextMediaField,
            sequence: "PageDown",
            handler: () => navigate(1),
            label: "Next Media Field",
            description: "Switch to the next media field",
          },
        ]
      : []
  );
};
