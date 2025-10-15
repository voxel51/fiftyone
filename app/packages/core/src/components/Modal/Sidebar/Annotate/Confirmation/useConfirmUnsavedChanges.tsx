import { MuiButton } from "@fiftyone/components";
import { Typography } from "@mui/material";
import { atom, useAtom, useSetAtom } from "jotai";
import React, { useCallback, useState } from "react";
import styled from "styled-components";
import Modal from "./Modal";

const showUnsavedChangesConfirmation = atom(false);

const Row = styled.div`
  padding-top: 1rem;
  display: flex;
  justify-content: space-between;
`;

export default function Leave({
  exit,
  save,
}: {
  exit: () => void;
  save: () => void;
}) {
  const [shown, show] = useAtom(showUnsavedChangesConfirmation);

  return shown ? (
    <Modal close={() => show(false)} title={"You have unsaved changes"}>
      <Typography color="secondary" padding="1rem 0">
        You edited annotations for this label but haven’t saved them yet.
        Unsaved changes will be lost if you discard them.
      </Typography>

      <Row>
        <MuiButton color="secondary" onClick={close} variant="outlined">
          Cancel
        </MuiButton>
        <MuiButton
          color="error"
          onClick={() => {
            exit();
            close();
          }}
          variant="contained"
        >
          Discard changes
        </MuiButton>
        <MuiButton
          color="success"
          onClick={() => {
            save();
            exit();
            close();
          }}
          variant="contained"
        >
          Save and continue
        </MuiButton>
      </Row>
    </Modal>
  ) : null;
}

export const useConfirmUnsavedChanges = (
  exit: () => void,
  save: () => void
) => {
  const [unsavedChanges] = useState(true); // todo
  const showConfirmation = useSetAtom(showUnsavedChangesConfirmation);
  return {
    confirmExit: useCallback(() => {
      if (unsavedChanges) {
        showConfirmation(true);
        return;
      }

      exit();
    }, [exit, showConfirmation, unsavedChanges]),
    LeaveChangesModal: () => <Leave exit={exit} save={save} />,
  };
};
