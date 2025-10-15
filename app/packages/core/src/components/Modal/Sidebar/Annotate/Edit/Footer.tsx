import { Button } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { DeleteOutline } from "@mui/icons-material";
import { useAtomValue, useSetAtom } from "jotai";
import React, { useCallback } from "react";
import { useRecoilValue } from "recoil";
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
  const sampleId = useRecoilValue(fos.currentSampleId);
  const showCancel = useAtomValue(isNew);

  const onSave = useCallback(() => {
    scene.dispatchSafely({
      type: LIGHTER_EVENTS.DO_PERSIST_OVERLAY,
      detail: { ...annotationLabel },
    });
  }, [annotationLabel, scene]);

  const onDelete = useCallback(() => {
    scene.dispatchSafely({
      type: LIGHTER_EVENTS.DO_REMOVE_OVERLAY,
      detail: {
        id: annotationLabel.data._id,
        sampleId,
        path: annotationLabel.path,
      },
    });
  }, [annotationLabel, sampleId, scene]);

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
