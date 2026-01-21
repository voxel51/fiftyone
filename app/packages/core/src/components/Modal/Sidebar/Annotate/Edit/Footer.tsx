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

export interface FooterProps {
  readOnly?: boolean;
}

const SaveFooter = ({ readOnly = false }: FooterProps) => {
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
          disabled={!changes || saving || readOnly}
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
        className={saving || readOnly ? "disabled" : ""}
        onClick={
          saving || readOnly ? undefined : showCancel ? onExitConfirm : onDelete
        }
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

export default function Footer({ readOnly = false }: FooterProps) {
  const field = useAtomValue(currentField);

  return (
    <Row style={{ flexDirection: "row-reverse" }}>
      {!field ? <CancelFooter /> : <SaveFooter readOnly={readOnly} />}
    </Row>
  );
}
