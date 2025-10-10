import { Button } from "@fiftyone/components";
import { LIGHTER_EVENTS, useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { DeleteOutline } from "@mui/icons-material";
import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { useRecoilValue } from "recoil";
import { RoundButton } from "../Actions";
import { Row } from "./Components";
import { current, currentField, editing } from "./state";

const SaveFooter = () => {
  const setEditingAtom = useSetAtom(editing);
  const { scene } = useLighter();
  const currentSampleId = useRecoilValue(fos.currentSampleId);
  const currentLabel = useAtomValue(current);

  return (
    <>
      <Button onClick={() => setEditingAtom(null)}>Save</Button>
      <RoundButton
        onClick={() => {
          setEditingAtom(null);
          if (!currentLabel?.path) return;

          if (!scene) return;

          scene.removeOverlay(currentLabel.data.id);

          scene.dispatchSafely({
            type: LIGHTER_EVENTS.DO_REMOVE_OVERLAY,
            detail: {
              id: currentLabel.data.id,
              sampleId: currentSampleId,
              path: currentLabel.path,
            },
          });
        }}
      >
        {currentLabel && <DeleteOutline />}
        Delete
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
