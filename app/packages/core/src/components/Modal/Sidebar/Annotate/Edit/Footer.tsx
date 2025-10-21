import { Button, MuiButton } from "@fiftyone/components";
import { DeleteOutline } from "@mui/icons-material";
import { useAtomValue } from "jotai";
import React, { useContext } from "react";
import { RoundButton } from "../Actions";
import { ConfirmationContext } from "../Confirmation";
import { Row } from "./Components";
import { currentField, hasChanges, isNew } from "./state";
import useExit from "./useExit";
import useSave from "./useSave";

const SaveFooter = () => {
  const { onDelete, onExit: onExitConfirm } = useContext(ConfirmationContext);
  const onExit = useExit();
  const onSave = useSave();
  const showCancel = useAtomValue(isNew);
  const changes = useAtomValue(hasChanges);

  return (
    <>
      <MuiButton
        disabled={!changes}
        onClick={() => {
          onSave();
          onExit();
        }}
        variant="contained"
        color="primary"
      >
        Save
      </MuiButton>
      <RoundButton onClick={showCancel ? onExitConfirm : onDelete}>
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
  const onExit = useExit();

  return <Button onClick={onExit}>Cancel</Button>;
};

export default function Footer() {
  const field = useAtomValue(currentField);

  return (
    <Row style={{ flexDirection: "row-reverse" }}>
      {!field ? <CancelFooter /> : <SaveFooter />}
    </Row>
  );
}
