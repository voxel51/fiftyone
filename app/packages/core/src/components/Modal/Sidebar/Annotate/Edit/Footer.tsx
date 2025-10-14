import { Button } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { DeleteOutline } from "@mui/icons-material";
import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { useRecoilValue } from "recoil";
import { RoundButton } from "../Actions";
import { Row } from "./Components";
import { currentField, deleteValue, editing, isNew, saveValue } from "./state";

const SaveFooter = () => {
  const saveCurrent = useSetAtom(saveValue);
  const deleteCurrent = useSetAtom(deleteValue);
  const sampleId = useRecoilValue(fos.currentSampleId);
  const datasetId = fos.useAssertedRecoilValue(fos.datasetId);

  const showCancel = useAtomValue(isNew);

  return (
    <>
      <Button
        onClick={() => {
          saveCurrent({ datasetId, sampleId });
        }}
      >
        Save
      </Button>
      <RoundButton
        onClick={() => {
          deleteCurrent({ datasetId, sampleId });
        }}
      >
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
