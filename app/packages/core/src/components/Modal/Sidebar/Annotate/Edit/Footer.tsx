import { Button } from "@fiftyone/components";
import { DeleteOutline } from "@mui/icons-material";
import { useAtomValue, useSetAtom } from "jotai";
import React, { useCallback } from "react";
import { RoundButton } from "../Actions";
import { Row } from "./Components";
import {
  current as currentLabelAtom,
  currentField,
  editing,
  isNew,
} from "./state";
import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";

const SaveFooter = () => {
  const { scene } = useLighter();
  const annotationLabel = useAtomValue(currentLabelAtom);
  const setEditing = useSetAtom(editing);
  const showCancel = useAtomValue(isNew);

  const onSave = useCallback(() => {
    if (scene) {
      scene.dispatchSafely({
        type: LIGHTER_EVENTS.DO_PERSIST_OVERLAY,
        detail: { ...annotationLabel },
      });
    }
  }, [annotationLabel, scene]);

  const onDelete = useCallback(() => {
    if (scene) {
      scene.dispatchSafely({
        type: LIGHTER_EVENTS.DO_REMOVE_OVERLAY,
        detail: {
          label: { ...annotationLabel },
          onSuccess: () => setEditing(null),
        },
      });
    }
  }, [annotationLabel, scene, setEditing]);

  return (
    <>
      <Button onClick={onSave}>Save</Button>
      <RoundButton onClick={onDelete}>
        {showCancel ? (
          "Cancel"
        ) : (
          <>
            <DeleteOutline />
            Delete
          </>
        )}
      </RoundButton>
    </>
  );
};

const CancelFooter = () => {
  const setEditingAtom = useSetAtom(editing);
  return <Button onClick={() => setEditingAtom(null)}>Cancel</Button>;
};

export default function Footer() {
  const field = useAtomValue(currentField);

  return (
    <Row style={{ flexDirection: "row-reverse" }}>
      {!field ? <CancelFooter /> : <SaveFooter />}
    </Row>
  );
}
