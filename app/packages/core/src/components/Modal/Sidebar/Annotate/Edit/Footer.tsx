import { Button } from "@fiftyone/components";
import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import { DeleteOutline } from "@mui/icons-material";
import { useAtomValue, useSetAtom } from "jotai";
import React, { useCallback, useContext } from "react";
import { RoundButton } from "../Actions";
import { ConfirmationContext } from "../Confirmation";
import { Row } from "./Components";
import {
  currentField,
  current as currentLabelAtom,
  editing,
  isNew,
} from "./state";

const SaveFooter = () => {
  const { scene } = useLighter();
  const annotationLabel = useAtomValue(currentLabelAtom);
  const showCancel = useAtomValue(isNew);
  const { deleteAnnotation } = useContext(ConfirmationContext);

  const onSave = useCallback(() => {
    scene?.dispatchSafely({
      type: LIGHTER_EVENTS.DO_PERSIST_OVERLAY,
      detail: { ...annotationLabel },
    });
  }, [annotationLabel, scene]);

  const onDelete = useCallback(() => {
    scene?.dispatchSafely({
      type: LIGHTER_EVENTS.DO_REMOVE_OVERLAY,
      detail: { ...annotationLabel },
    });
  }, [annotationLabel, scene]);

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
