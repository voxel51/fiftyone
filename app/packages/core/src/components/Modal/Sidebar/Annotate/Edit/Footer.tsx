import { Button, MuiButton } from "@fiftyone/components";
import { DeleteOutline } from "@mui/icons-material";
import { useAtomValue } from "jotai";
import React, { default as React, default as React, useContext } from "react";
import { RoundButton } from "../Actions";
import { ConfirmationContext } from "../Confirmation";
import { Row } from "./Components";
import { currentField, isNew } from "./state";
import useExit from "./useExit";
import useHasChanges from "./useHasChanges";
import useSave from "./useSave";

const SaveFooter = () => {
  const { onDelete } = useContext(ConfirmationContext);
  const onExit = useExit();
  const onSave = useSave();
  const showCancel = useAtomValue(isNew);
  const hasChanges = useHasChanges();

  return (
    <>
      <MuiButton
        disabled={!hasChanges}
        onClick={() => {
          onSave();
          onExit();
        }}
        variant="contained"
        color="primary"
      >
        Save
      </MuiButton>
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
  const { onDelete } = useContext(ConfirmationContext);

  return <Button onClick={onDelete}>Cancel</Button>;
};

export default function Footer() {
  const field = useAtomValue(currentField);

  return (
    <Row style={{ flexDirection: "row-reverse" }}>
      {!field ? <CancelFooter /> : <SaveFooter />}
    </Row>
  );
}
