import { Loading } from "@fiftyone/components";
import { SpaceNodeJSON, useSpaces } from "@fiftyone/spaces";
import { Space } from "@fiftyone/spaces/src/components";
import { FIFTYONE_MODAL_SPACES_ID } from "@fiftyone/state/src/constants";
import React, { useEffect } from "react";
import {
  saveModalSpacesToLocalStorage,
  useModalSpaces,
} from "./modal-spaces-utils";

const ModalSpaceImpl = React.memo(
  ({ defaultSpaces }: { defaultSpaces: SpaceNodeJSON }) => {
    const { spaces: modalSpaces } = useSpaces(
      FIFTYONE_MODAL_SPACES_ID,
      defaultSpaces
    );

    useEffect(() => {
      // persist to local storage when modal spaces changes
      saveModalSpacesToLocalStorage(modalSpaces.toJSON());
    }, [modalSpaces]);

    return (
      <Space
        node={modalSpaces.root}
        id={FIFTYONE_MODAL_SPACES_ID}
        archetype="modal"
      />
    );
  }
);

export const ModalSpace = () => {
  const defaultModalSpaces = useModalSpaces();

  if (defaultModalSpaces) {
    return <ModalSpaceImpl defaultSpaces={defaultModalSpaces} />;
  }

  return <Loading>Pixelating...</Loading>;
};
