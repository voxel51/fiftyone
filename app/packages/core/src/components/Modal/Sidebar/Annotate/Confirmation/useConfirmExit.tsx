import { MuiButton } from "@fiftyone/components";
import { Typography } from "@mui/material";
import { atom, useAtom, useSetAtom } from "jotai";
import React, { useCallback } from "react";
import styled from "styled-components";
import Modal from "./Modal";

const showUnsavedChangesConfirmation = atom(false);

const Row = styled.div`
  padding-top: 1rem;
  display: flex;
  justify-content: space-between;
`;

function ExitChangesModal({
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

        <div style={{ display: "flex", columnGap: "0.5rem" }}>
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
        </div>
      </Row>
    </Modal>
  ) : null;
}

export default function useConfirmExit(
  exit: () => void,
  saveAnnotation: () => void
) {
  const hasChanges = true;
  const showConfirmation = useSetAtom(showUnsavedChangesConfirmation);
  return {
    confirmExit: useCallback(() => {
      if (hasChanges) {
        showConfirmation(true);
        return;
      }

      exit();
    }, [exit, showConfirmation, hasChanges]),
    ExitChangesModal: () => (
      <ExitChangesModal exit={exit} save={saveAnnotation} />
    ),
  };
}
