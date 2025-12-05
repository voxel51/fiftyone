import { Button, LoadingDots, MuiButton } from "@fiftyone/components";
import { DeleteOutline } from "@mui/icons-material";
import { useAtomValue } from "jotai";
import React, { useContext } from "react";
import { RoundButton } from "../Actions";
import { ConfirmationContext } from "../Confirmation";
import { Row } from "./Components";
import { currentField, hasChanges, isNew } from "./state";
import useExit from "./useExit";
import useSave, { isSavingAtom } from "./useSave";
import { Stack } from "@mui/material";

const SaveFooter = () => {
  const { onDelete, onExit: onExitConfirm } = useContext(ConfirmationContext);
  const onSave = useSave();
  const onDiscard = useExit();
  const showCancel = useAtomValue(isNew);
  const changes = useAtomValue(hasChanges);
  const saving = useAtomValue(isSavingAtom);

  return (
    <>
      <Stack direction="row" spacing={1}>
        <MuiButton
          disabled={!changes || saving}
          onClick={onDiscard}
          variant="outlined"
        >
          Discard
        </MuiButton>

        <MuiButton
          disabled={!changes || saving}
          onClick={() => {
            onSave();
          }}
          variant="contained"
          color="primary"
        >
          {saving ? <LoadingDots text={"Saving"} /> : "Save"}
        </MuiButton>
      </Stack>

      <RoundButton
        className={saving ? "disabled" : ""}
        onClick={saving ? undefined : showCancel ? onExitConfirm : onDelete}
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
